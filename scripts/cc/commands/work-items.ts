import type { Command } from 'commander';
import { createClient, ApiError } from '../lib/client.js';
import { respond, respondError, table, isAgent } from '../lib/envelope.js';

interface WorkItemNote {
  note: string;
  actor: string;
  event_type: string;
  created_at: string;
}

interface GetResponse {
  item: WorkItem;
  notes: WorkItemNote[];
  events: unknown[];
}

export interface WorkItem {
  id: string;
  title: string;
  description?: string;
  /**
   * Most recent notes, newest first. The API attaches these to every list and
   * get response as of 2026-08-31 — before that notes were write-only, so a
   * correction recorded as a note was invisible to whoever read the item next.
   */
  recent_notes?: WorkItemNote[];
  project?: string;
  status: string;
  priority?: string;
  type?: string;
  source_type?: string;
  assigned_to?: string;
  /**
   * Every item carries one (ruling 2026-09-02: "Rocks are priorities. Those
   * are what all priorities should be filtering through."). 'none' is the
   * explicit default for untagged items, not an absence of the field.
   */
  rock?: string;
  metadata?: Record<string, unknown> | null;
  /** True while the item waits in a weekly "Agent inbox" (2026-10-27). */
  in_agent_inbox?: boolean;
  /** On an inbox container row: how many items are still waiting in it. */
  inbox_count?: number;
  /**
   * Set by `cc wi list` on a snoozed item whose wake date has passed but
   * which the daily wake job has not put back yet. See mergeOverdueWakes.
   */
  overdue_wake?: boolean;
  created_at: string;
  updated_at: string;
}

const UUID_LENGTH = 36;

// ---------------------------------------------------------------------------
// Snooze until a date, then wake (2026-10-13).
//
// A tripwire item has nothing to do until a date. `cc wi snooze` parks it off
// the open list (status deferred + metadata.snooze.until); the Command Center
// app's daily job (/api/cron/wake-snoozed) puts it back on its date.
//
// A missed tripwire is the one failure that matters, so the CLI does not
// trust the job: every default `cc wi list` also asks for the snoozed items
// and prints any whose date has passed as OVERDUE WAKE.
// ---------------------------------------------------------------------------

export const SNOOZE_TIME_ZONE = 'America/Chicago';

/** Today's calendar date in Chicago as YYYY-MM-DD (same rule as the wake job). */
export function chicagoToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SNOOZE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** True only for a real calendar date written exactly as YYYY-MM-DD. */
export function isValidSnoozeDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * Parse `cc wi snooze --until <date>`. Pure, so the rules are unit-tested.
 * Throws on a missing date, anything that is not a real YYYY-MM-DD date, and
 * any date that is not after today in Chicago. Today itself is refused: the
 * wake job may already have run today.
 */
export function parseSnoozeUntilFlag(raw: string | undefined, today: string = chicagoToday()): string {
  const value = (raw ?? '').trim();
  if (!value) throw new Error('--until is required (YYYY-MM-DD)');
  if (!isValidSnoozeDate(value)) {
    throw new Error(`--until must be a real date written YYYY-MM-DD (got "${value}")`);
  }
  if (value <= today) {
    throw new Error(`--until must be after today (${today}, Chicago); got ${value}`);
  }
  return value;
}

/** True when the item is snoozed: deferred and carrying metadata.snooze. */
export function isSnoozed(item: WorkItem): boolean {
  const snooze = item.metadata?.snooze;
  return item.status === 'deferred' && !!snooze && typeof snooze === 'object' && !Array.isArray(snooze);
}

/** The wake date of a snoozed item, or null if it has none that can be read. */
export function snoozeUntil(item: WorkItem): string | null {
  if (!isSnoozed(item)) return null;
  const until = (item.metadata!.snooze as Record<string, unknown>).until;
  return isValidSnoozeDate(until) ? until : null;
}

/**
 * A snoozed item is overdue when its wake date is today or earlier, or when
 * its wake date cannot be read at all (it could never come due on its own).
 */
export function isOverdueWake(item: WorkItem, today: string): boolean {
  if (!isSnoozed(item)) return false;
  const until = snoozeUntil(item);
  return until === null || until <= today;
}

/** Snoozed items only, soonest wake first; unreadable dates sort to the top. */
export function sortBySnoozeWake(items: WorkItem[]): WorkItem[] {
  return items
    .filter(isSnoozed)
    .sort((a, b) => (snoozeUntil(a) ?? '').localeCompare(snoozeUntil(b) ?? '') || a.id.localeCompare(b.id));
}

export interface SnoozeSummary {
  /** How many items are snoozed right now. */
  count: number;
  /** Earliest wake date still ahead, or null. */
  next_wake: string | null;
  overdue_count: number;
  /** False when the snoozed items could not be fetched: the check did not run. */
  checked: boolean;
  /** True when the API sent back a full page, so more snoozed items may exist than were seen. */
  truncated: boolean;
  /** The one line printed under every default `cc wi list`. */
  line: string;
}

export function summarizeSnoozed(snoozedItems: WorkItem[], today: string, truncated = false): SnoozeSummary {
  const snoozed = sortBySnoozeWake(snoozedItems);
  const overdue = snoozed.filter((i) => isOverdueWake(i, today));
  const upcoming = snoozed.map(snoozeUntil).filter((d): d is string => d !== null && d > today);
  const next_wake = upcoming.length ? upcoming[0] : null;

  let line = snoozed.length === 0
    ? 'Snoozed: 0 items'
    : `Snoozed: ${snoozed.length} item${snoozed.length === 1 ? '' : 's'}, next wake ${next_wake ?? 'none ahead'}`;
  if (overdue.length) {
    line += `. ${overdue.length} OVERDUE WAKE (date passed, wake job has not run): shown above`;
  }
  if (truncated) {
    line += `. WARNING: the API sent its ${SNOOZED_FETCH_LIMIT}-item maximum, so more snoozed items may exist than are listed. Overdue tripwires may be missing`;
  }
  return { count: snoozed.length, next_wake, overdue_count: overdue.length, checked: true, truncated, line };
}

/** Summary used when the snoozed fetch failed. Loud on purpose. */
export function snoozeCheckFailedSummary(reason: string): SnoozeSummary {
  return {
    count: 0,
    next_wake: null,
    overdue_count: 0,
    checked: false,
    truncated: false,
    line: `Snoozed: CHECK FAILED (${reason}). Overdue tripwires may be missing. Run \`cc wi list --snoozed\``,
  };
}

/**
 * Put overdue snoozed items at the top of a list, each flagged
 * `overdue_wake: true`. An item already in the list is flagged in place
 * rather than added twice.
 */
export function mergeOverdueWakes(listItems: WorkItem[], snoozedItems: WorkItem[], today: string): WorkItem[] {
  const overdue = sortBySnoozeWake(snoozedItems).filter((i) => isOverdueWake(i, today));
  if (overdue.length === 0) return listItems;
  const overdueIds = new Set(overdue.map((i) => i.id));
  return [
    ...overdue.map((i) => ({ ...i, overdue_wake: true })),
    ...listItems.filter((i) => !overdueIds.has(i.id)),
  ];
}

/**
 * The most items GET /api/work-items returns in one call. The Command Center
 * route clamps `limit` to 200 and has no offset or cursor, so one call is all
 * the CLI can get. (The app's daily wake job reads the table directly, up to
 * 1000, so it sees more than this.) Asking for more changes nothing.
 */
export const SNOOZED_FETCH_LIMIT = 200;

/**
 * A page that came back full may have been cut off. The API sorts newest
 * first, so a cut-off page drops the oldest items, which are often the
 * longest-running tripwires.
 */
export function isTruncatedPage(returned: number): boolean {
  return returned >= SNOOZED_FETCH_LIMIT;
}

/**
 * Every snoozed item the key can see. `snoozed=true` is filtered by the
 * server; the result is filtered again here so an older deploy that ignores
 * the param (and returns every deferred item) still yields only snoozed ones.
 * Deliberately not narrowed by --project/--assigned-to/--rock: an overdue
 * tripwire should surface whatever view was asked for.
 */
async function fetchSnoozed(client: ReturnType<typeof createClient>): Promise<{ items: WorkItem[]; truncated: boolean }> {
  const data = await client.get<ListResponse>(`/api/work-items?status=deferred&snoozed=true&limit=${SNOOZED_FETCH_LIMIT}`);
  return { items: sortBySnoozeWake(data.items), truncated: isTruncatedPage(data.items.length) };
}

interface SnoozeResponse {
  item?: { id: string; status: string; metadata?: Record<string, unknown> | null };
  snooze?: { until?: string; from_status?: string; by?: string; at?: string } | null;
  woke?: boolean;
}

/**
 * A short ID that matches no item, or more than one. cc.ts prints the message
 * as a clean error instead of a stack trace.
 */
export class ShortIdError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShortIdError';
  }
}

/**
 * Pick the one item a short ID names from the server's prefix matches. Pure,
 * so the 0 / 1 / many rules are unit-tested. Matches are re-checked against
 * the prefix here so an older server that ignores `id_prefix` (and returns the
 * plain list) can never resolve to the wrong item.
 */
export function pickShortIdMatch(shortId: string, items: Pick<WorkItem, 'id' | 'title' | 'status'>[]): string {
  const prefix = shortId.toLowerCase();
  const matches = items.filter(i => i.id.toLowerCase().startsWith(prefix));
  if (matches.length === 0) {
    throw new ShortIdError(`No work item found matching short ID "${shortId}"`);
  }
  if (matches.length > 1) {
    const lines = matches.map(i => `  ${i.id}  [${i.status}]  ${i.title}`).join('\n');
    throw new ShortIdError(`Ambiguous short ID "${shortId}" matches ${matches.length} items. Use a longer prefix:\n${lines}`);
  }
  return matches[0].id;
}

/**
 * Resolve a short ID prefix (e.g. "5d5bf4fe") to a full UUID. The server
 * matches the prefix across every status, snoozed and done included
 * (`GET /api/work-items?id_prefix=`, command-center 2026-10-14). Before that
 * the CLI matched only the newest 200 items, so older items failed. Returns
 * the ID unchanged if it's already a full UUID.
 */
async function resolveId(client: ReturnType<typeof createClient>, shortId: string): Promise<string> {
  if (shortId.length >= UUID_LENGTH) return shortId;

  const data = await client.get<ListResponse>(`/api/work-items?id_prefix=${encodeURIComponent(shortId)}`);
  return pickShortIdMatch(shortId, data.items);
}

/**
 * Parse the --metadata flag value into a plain JSON object.
 *
 * The reviewer system prompt instructs agents to attach severity, decision_category,
 * files[], suggested_fix, and effort via `--metadata '<json>'` on every
 * `cc wi create`. We keep this as a pure helper so the parsing rules are
 * unit-testable without spinning up commander + fetch mocks.
 *
 * Returns:
 *  - undefined if input is undefined (flag not provided)
 *  - a validated object on success
 * Throws:
 *  - Error on invalid JSON
 *  - Error when the parsed value is not a plain object (array, primitive, null)
 */
export function parseMetadataFlag(
  raw: string | undefined,
): Record<string, unknown> | undefined {
  if (raw === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid --metadata JSON: ${msg}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    const kind = Array.isArray(parsed) ? 'array' : parsed === null ? 'null' : typeof parsed;
    throw new Error(`--metadata must be a JSON object (got ${kind})`);
  }
  return parsed as Record<string, unknown>;
}

/**
 * Parse the --exit flag value into an integer exit code.
 *
 * Pure helper (mirrors parseMetadataFlag) so the validation is
 * unit-testable without commander + fetch. `cc wi validate` requires this
 * before it can derive the server's required `status` field
 * (passed/failed) — the API's apiValidationRunSchema (command-center
 * src/lib/validation.ts) rejects a 'passed' status unless exit_code is
 * exactly 0, so getting this parse right matters.
 *
 * Throws Error on anything that isn't a base-10 integer string.
 */
export function parseExitCodeFlag(raw: string): number {
  if (!/^-?\d+$/.test(raw.trim())) {
    throw new Error(`--exit must be an integer exit code (got "${raw}")`);
  }
  return parseInt(raw, 10);
}

async function resolveIds(client: ReturnType<typeof createClient>, ids: string[]): Promise<string[]> {
  const resolved: string[] = [];
  for (const id of ids) {
    resolved.push(await resolveId(client, id));
  }
  return resolved;
}

interface ListResponse {
  items: WorkItem[];
  count: number;
}

interface CreateResponse {
  created: { id: string; title: string }[];
  skipped: { title: string; reason: string; existing_id?: string }[];
  errors: { title: string; error: string }[];
  summary: { requested: number; created: number; skipped: number; failed: number };
}

interface UpdateResponse {
  item?: { id: string; status: string; updated_at: string };
  updated?: string[];
  errors?: { id: string; error: string }[];
  summary?: { requested: number; succeeded: number; failed: number };
}

/**
 * Response shape from POST /api/work-items/<id>/validation
 * (command-center src/app/api/work-items/[id]/validation/route.ts).
 * The route returns the inserted row as-is from
 * recordValidationRun/work_item_validation_runs, so we only type the
 * fields the CLI itself prints and leave the rest as unknown passthrough
 * for the JSON envelope.
 */
interface ValidationRunResponse {
  run: {
    id?: string;
    work_item_id?: string;
    runner?: string;
    revision?: string;
    command?: string;
    status?: string;
    exit_code?: number | null;
    artifact_url?: string | null;
    notes?: string | null;
    recorded_by?: string;
    recorded_by_type?: string;
    created_at?: string;
    [key: string]: unknown;
  };
}

export interface RockGroup {
  rock: string;
  items: WorkItem[];
}

export interface PrioritiesResponse {
  rocks: RockGroup[];
  serves_no_rock: RockGroup;
  count: number;
}

export const ROCK_DISPLAY_NAMES: Record<string, string> = {
  'prepare-gt-2027': 'Prepare GT 2027',
  'raise-capital': 'Raise Capital',
  '500-doors': '500 Doors',
  'national-brand': 'National Brand',
  'third-flavor': 'Third Flavor',
  'none': 'No Rock',
};

/**
 * Human label for a rock slug, used by `cc wi priorities`'s TTY output.
 * Falls back to the raw slug for anything not in ROCK_DISPLAY_NAMES so a
 * newly added rock the CLI doesn't know about yet still renders, rather
 * than showing "undefined".
 */
export function formatRockLabel(rock: string): string {
  return ROCK_DISPLAY_NAMES[rock] || rock;
}

/**
 * Client-side assignee filter for `cc wi priorities --assigned-to <who>`.
 *
 * Verified 2026-09-16: /api/work-items/priorities ignores an `assigned_to`
 * query param (identical rocks/count with and without it), unlike
 * /api/work-items (list), which does filter server-side. So this endpoint's
 * filter has to happen here, after the fetch. Case-insensitive match, since
 * assignees are typed by hand ("clay", "Clay", "CLAY" should all match).
 * Rocks and serves_no_rock are each filtered down to their matching items;
 * `count` is recomputed from what is actually returned, not copied from the
 * unfiltered response, so a CLI/agent reading `count` never sees a number
 * that does not match the items shown.
 */
export function filterPrioritiesByAssignee(data: PrioritiesResponse, assignedTo: string): PrioritiesResponse {
  const want = assignedTo.trim().toLowerCase();
  const keep = (item: WorkItem) => (item.assigned_to ?? '').trim().toLowerCase() === want;
  const rocks = data.rocks.map((group) => ({ rock: group.rock, items: group.items.filter(keep) }));
  const serves_no_rock = { rock: data.serves_no_rock.rock, items: data.serves_no_rock.items.filter(keep) };
  const count = rocks.reduce((n, g) => n + g.items.length, 0) + serves_no_rock.items.length;
  return { rocks, serves_no_rock, count };
}

export function registerWorkItems(program: Command) {
  const wi = program.command('work-items').alias('wi').description('Manage work items');

  wi.command('list')
    .description('List work items')
    .option('-p, --project <project>', 'Filter by project')
    .option('-s, --status <status>', 'Filter by status (comma-separated)', 'discovered,triaged,approved,in_progress,review')
    .option('-l, --limit <n>', 'Max results', '50')
    .option('--type <type>', 'Filter by type (comma-separated)')
    .option('--rock <rock>', 'Filter by rock: prepare-gt-2027, raise-capital, 500-doors, national-brand, third-flavor, none')
    .option('--assigned-to <who>', 'Filter by assignee (server-side: /api/work-items already supports this param, verified 2026-09-16)')
    .option('--include-initiatives', 'Include initiative/sprint container items (excluded by default)')
    .option('--snoozed', 'List snoozed items only (parked until a date), soonest wake first')
    .option('--inbox', 'List only the items waiting in the weekly agent inbox (agent-filed, not yet promoted)')
    .option('--include-inbox', 'Include items waiting in the agent inbox (hidden by default, like initiatives)')
    .action(async (opts, cmd: Command) => {
      try {
        const client = createClient(program.opts().url);
        const today = chicagoToday();

        if (opts.snoozed) {
          const fetched = await fetchSnoozed(client);
          let snoozed = fetched.items;
          if (opts.project) snoozed = snoozed.filter(i => i.project === opts.project);
          if (opts.assignedTo) snoozed = snoozed.filter(i => i.assigned_to === opts.assignedTo);
          if (opts.rock) snoozed = snoozed.filter(i => (i.rock || 'none') === opts.rock);
          const summary = summarizeSnoozed(snoozed, today, fetched.truncated);
          const items = snoozed.map(i => (isOverdueWake(i, today) ? { ...i, overdue_wake: true } : i));

          respond('cc work-items list --snoozed', { items, count: items.length, snooze_summary: summary }, [
            { command: `cc wi wake -i <id>`, description: 'Wake one now, before its date' },
            { command: `cc wi snooze -i <id> --until YYYY-MM-DD`, description: 'Move a wake date' },
          ]);

          if (!isAgent) {
            console.log(`\n${items.length} snoozed item(s), soonest wake first:\n`);
            table(items.map(i => ({
              id: i.id.slice(0, 8),
              wake: i.overdue_wake ? `${snoozeUntil(i) ?? 'unreadable'} OVERDUE WAKE` : snoozeUntil(i),
              back_to: String((i.metadata?.snooze as Record<string, unknown>)?.from_status ?? 'triaged'),
              project: i.project || '-',
              title: i.title.slice(0, 60),
            })), ['id', 'wake', 'back_to', 'project', 'title']);
            console.log(`\n${summary.line.replace(': shown above', '')}`);
          }
          return;
        }

        const params = new URLSearchParams();
        if (opts.project) params.set('project', opts.project);
        if (opts.status) params.set('status', opts.status);
        if (opts.limit) params.set('limit', opts.limit);
        if (opts.rock) params.set('rock', opts.rock);
        if (opts.assignedTo) params.set('assigned_to', opts.assignedTo);
        if (opts.type) {
          params.set('type', opts.type);
        } else if (!opts.includeInitiatives) {
          params.set('exclude_type', 'initiative');
        }
        // Agent inbox (2026-10-27): items agents filed wait in a weekly inbox
        // and stay off the default list until promoted. --inbox shows only
        // them; --include-inbox shows everything. Closed ones are never hidden.
        if (opts.inbox) {
          params.set('inbox', 'only');
          params.delete('exclude_type');
        } else if (!opts.includeInbox) {
          params.set('exclude_inbox', 'true');
        }

        const listed = await client.get<ListResponse>(`/api/work-items?${params}`);

        // Fail-safe for snoozed tripwires. Runs on the default open list (no
        // explicit --status): a snoozed item whose date has passed is added
        // back at the top, marked OVERDUE WAKE, even if the daily wake job
        // never ran. If this check itself fails the list still prints, and
        // says loudly that the check did not run.
        let data: ListResponse & { snooze_summary?: SnoozeSummary } = listed;
        if (cmd.getOptionValueSource('status') === 'default') {
          try {
            const fetched = await fetchSnoozed(client);
            const items = mergeOverdueWakes(listed.items, fetched.items, today);
            data = { items, count: items.length, snooze_summary: summarizeSnoozed(fetched.items, today, fetched.truncated) };
          } catch (snoozeErr) {
            const reason = snoozeErr instanceof ApiError ? `API ${snoozeErr.status}` : 'request failed';
            data = { ...listed, snooze_summary: snoozeCheckFailedSummary(reason) };
          }
        }

        respond('cc work-items list', data, [
          { command: `cc wi list --status=done --limit=10`, description: 'View completed items' },
          { command: `cc wi create --title "New task" --project mainline-apps`, description: 'Create a new work item' },
          { command: `cc wi list --snoozed`, description: 'View snoozed items and their wake dates' },
        ]);

        if (!isAgent) {
          console.log(`\n${data.count} work items:\n`);
          table(data.items.map(i => ({
            id: i.id.slice(0, 8),
            status: i.overdue_wake ? 'OVERDUE WAKE' : i.status,
            priority: i.priority || '-',
            project: i.project || '-',
            rock: i.rock || 'none',
            title: (i.title.slice(0, 60) + (i.inbox_count !== undefined ? ` [${i.inbox_count === 1 ? '1 item' : `${i.inbox_count} items`}]` : '')),
            notes: i.recent_notes?.length ? String(i.recent_notes.length) : '-',
          })), ['id', 'status', 'priority', 'project', 'rock', 'title', 'notes']);

          const waiting = data.items.reduce((n, i) => n + (i.inbox_count ?? 0), 0);
          if (waiting > 0 && !opts.inbox) {
            console.log(`\n${waiting} agent-filed item(s) waiting in the inbox: \`cc wi list --inbox\` (keep one: \`cc wi promote -i <id>\`, drop one: \`cc wi reject -i <id> --notes "why"\`)`);
          }

          // A note is usually a CORRECTION to the description above it. Surface
          // the newest one inline so a human skimming the table sees that the
          // item has been amended, rather than trusting stale description text.
          const amended = data.items.filter(i => i.recent_notes?.length);
          if (amended.length) {
            console.log(`\n${amended.length} item(s) carry notes — newest shown, run \`cc wi get <id>\` for all:`);
            for (const i of amended) {
              const n = i.recent_notes![0];
              console.log(`  ${i.id.slice(0, 8)} [${n.created_at.slice(0, 10)}] ${n.note.slice(0, 160)}${n.note.length > 160 ? '…' : ''}`);
            }
          }

          if (data.snooze_summary) console.log(`\n${data.snooze_summary.line}`);
        }
      } catch (e) {
        if (e instanceof ApiError) {
          respondError('cc work-items list', e.body, String(e.status),
            e.status === 401 ? 'Check COMMAND_CENTER_API_KEY' : 'Check server logs');
        }
        throw e;
      }
    });

  wi.command('create')
    .description('Create a work item')
    .requiredOption('-t, --title <title>', 'Title')
    .option('-d, --description <desc>', 'Description')
    .option('-p, --project <project>', 'Project name')
    .option('--priority <priority>', 'Priority: high, medium, low', 'medium')
    .option('--type <type>', 'Type: task, finding, initiative, research_request', 'task')
    .option('--source <source>', 'Source type: human, agent', 'human')
    .option('--assigned-to <who>', 'Assign to')
    .option('--rock <rock>', 'Rock: prepare-gt-2027, raise-capital, 500-doors, national-brand, third-flavor, none (defaults to none)')
    .option('--created-by <who>', 'Created by', 'clay')
    .option(
      '--metadata <json>',
      'Structured metadata as JSON object (e.g. \'{"severity":"high","files":["a.ts"]}\') — ' +
        'used by nightly reviewers to attach severity, decision_category, files, ' +
        'suggested_fix, and effort without stuffing them into the description.',
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.opts().url);

        // Parse --metadata JSON if provided. Must be a JSON object (not a
        // primitive/array) so the server can merge it into the work_items
        // metadata column without shape surprises. Fail loud on invalid
        // JSON — silently dropping a reviewer's evidence payload is worse
        // than a short error.
        let metadata: Record<string, unknown> | undefined;
        try {
          metadata = parseMetadataFlag(opts.metadata);
        } catch (parseErr) {
          const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
          respondError(
            'cc work-items create',
            msg,
            '400',
            'Pass a valid JSON object, e.g. --metadata \'{"severity":"high"}\'',
          );
          return;
        }

        const body: Record<string, unknown> = {
          title: opts.title,
          description: opts.description,
          project: opts.project,
          priority: opts.priority,
          type: opts.type,
          source_type: opts.source,
          assigned_to: opts.assignedTo,
          rock: opts.rock,
          created_by: opts.createdBy,
        };
        if (metadata) body.metadata = metadata;

        const data = await client.post<CreateResponse>('/api/work-items', body);

        respond('cc work-items create', data, [
          ...(data.created.length > 0
            ? [{ command: `cc wi list --project=${opts.project || 'all'}`, description: 'List items in project' }]
            : []),
          ...(data.skipped.length > 0
            ? [{ command: `cc wi list --status=discovered,triaged`, description: 'View open items (duplicate found)' }]
            : []),
        ]);

        if (!isAgent) {
          if (data.created.length > 0) {
            console.log(`Created: ${data.created[0].title} (${data.created[0].id.slice(0, 8)})`);
          }
          if (data.skipped.length > 0) {
            console.log(`Skipped (duplicate): ${data.skipped[0].title} — ${data.skipped[0].reason}`);
          }
          if (data.errors?.length > 0) {
            console.error(`Failed: ${data.errors[0].error}`);
          }
        }
      } catch (e) {
        if (e instanceof ApiError) {
          respondError('cc work-items create', e.body, String(e.status),
            e.status === 401 ? 'Check COMMAND_CENTER_API_KEY' : 'Check required fields');
        }
        throw e;
      }
    });

  wi.command('bulk-create')
    .description('Create multiple work items from JSON')
    .argument('<json>', 'JSON array of items or path to JSON file')
    .action(async (json) => {
      try {
        const client = createClient(program.opts().url);
        let items: unknown[];

        // Try as file path first, then as inline JSON
        try {
          const fs = await import('fs');
          if (fs.existsSync(json)) {
            items = JSON.parse(fs.readFileSync(json, 'utf8'));
          } else {
            items = JSON.parse(json);
          }
        } catch {
          items = JSON.parse(json);
        }

        if (!Array.isArray(items)) {
          items = [items];
        }

        const data = await client.post<CreateResponse>('/api/work-items', { items });

        respond('cc work-items bulk-create', data, [
          { command: `cc wi list`, description: 'View all work items' },
        ]);

        if (!isAgent) {
          console.log(`Summary: ${data.summary.created} created, ${data.summary.skipped} skipped, ${data.summary.failed} failed`);
          for (const c of data.created) console.log(`  + ${c.title} (${c.id.slice(0, 8)})`);
          for (const s of data.skipped) console.log(`  ~ ${s.title} — ${s.reason}`);
          for (const e of data.errors) console.error(`  ! ${e.title} — ${e.error}`);
        }
      } catch (e) {
        if (e instanceof ApiError) {
          respondError('cc work-items bulk-create', e.body, String(e.status), 'Check JSON format');
        }
        throw e;
      }
    });

  wi.command('get')
    .description('Show one work item in full, including its notes')
    .argument('<id>', 'Work item ID (full UUID or short prefix)')
    .action(async (id: string) => {
      try {
        const client = createClient(program.opts().url);
        const fullId = await resolveId(client, id);
        const data = await client.get<GetResponse>(`/api/work-items/${fullId}`);

        respond('cc work-items get', data, [
          { command: `cc wi update --id ${fullId.slice(0, 8)} --description "..."`, description: 'Correct the description' },
        ]);

        if (!isAgent) {
          const i = data.item;
          console.log(`\n${i.title}\n`);
          console.log(`  id       ${i.id}`);
          console.log(`  project  ${i.project || '-'}`);
          console.log(`  status   ${i.status}   priority ${i.priority || '-'}   type ${i.type || '-'}`);
          console.log(`  created  ${i.created_at}`);
          console.log(`\n${i.description || '(no description)'}\n`);
          if (data.notes?.length) {
            console.log(`Notes (${data.notes.length}, newest first):`);
            for (const n of data.notes) {
              console.log(`  [${n.created_at.slice(0, 10)} ${n.actor}] ${n.note}`);
            }
          } else {
            console.log('Notes: none');
          }
        }
      } catch (e) {
        if (e instanceof ApiError) {
          respondError('cc work-items get', e.body, String(e.status),
            e.status === 404 ? 'Check work item ID' : 'Check server logs');
        }
        throw e;
      }
    });

  wi.command('update')
    .description('Update a work item')
    .requiredOption('-i, --id <id>', 'Work item ID')
    .option('-s, --status <status>', 'New status')
    .option('-t, --title <title>', 'Replace the title')
    .option(
      '-d, --description <desc>',
      'Replace the description. Use this to CORRECT an item whose description is ' +
        'wrong — a note does not override the description for readers who only list.',
    )
    .option('--priority <priority>', 'New priority: critical, high, medium, low')
    .option('--assigned-to <who>', 'Assign to')
    .option('--rock <rock>', 'Re-tag rock: prepare-gt-2027, raise-capital, 500-doors, national-brand, third-flavor, none')
    .option('--notes <notes>', 'Append a note (visible via `cc wi get` and on list)')
    .option('--actor <actor>', 'Actor name', 'clay')
    .action(async (opts) => {
      try {
        const client = createClient(program.opts().url);
        const fullId = await resolveId(client, opts.id);

        // Use the worker-update schema (id singular) which supports all statuses,
        // rather than bulk-close schema (ids array) which only allows done/rejected/deferred.
        const body: Record<string, unknown> = { id: fullId };
        if (opts.status) body.status = opts.status;
        if (opts.title) body.title = opts.title;
        if (opts.description !== undefined) body.description = opts.description;
        if (opts.priority) body.priority = opts.priority;
        if (opts.assignedTo) body.assigned_to = opts.assignedTo;
        if (opts.rock) body.rock = opts.rock;
        if (opts.notes) body.notes = opts.notes;
        if (opts.actor) body.actor = opts.actor;

        // Deliberately the COLLECTION endpoint, not /api/work-items/<id>.
        // Both accept the same worker-update payload, but the collection route
        // has always existed — pinning to it means the CLI keeps working even
        // if it is running against an older deploy of the dashboard.
        const data = await client.patch<UpdateResponse>('/api/work-items', body);

        respond('cc work-items update', data, [
          { command: `cc wi list --status=${opts.status || 'all'}`, description: 'View items with this status' },
        ]);

        if (!isAgent) {
          if (data.item) {
            console.log(`Updated: ${data.item.id.slice(0, 8)} → ${data.item.status}`);
          }
        }
      } catch (e) {
        if (e instanceof ApiError) {
          respondError('cc work-items update', e.body, String(e.status),
            e.status === 404 ? 'Check work item ID' : 'Check allowed status values');
        }
        throw e;
      }
    });

  wi.command('promote')
    .description(
      'Take an item out of the weekly agent inbox. It leaves the inbox (unparented) and, if it was ' +
        'discovered, becomes triaged, so it shows on your open list. Comma-separate ids to promote several.',
    )
    .requiredOption('-i, --id <ids>', 'Work item ID (full UUID or short prefix); comma-separated for several')
    .option('--notes <notes>', 'Why it is worth keeping (added to the item history)')
    .option('--actor <actor>', 'Actor name', 'clay')
    .action(async (opts) => {
      await runInboxOperation('inbox_promote', 'promote', opts);
    });

  wi.command('reject')
    .description(
      'Reject an item waiting in the weekly agent inbox (closes it rejected, outcome declined). ' +
        'A reason is required. Comma-separate ids to reject several.',
    )
    .requiredOption('-i, --id <ids>', 'Work item ID (full UUID or short prefix); comma-separated for several')
    .requiredOption('--notes <notes>', 'Why it is not needed')
    .option('--actor <actor>', 'Actor name', 'clay')
    .action(async (opts) => {
      await runInboxOperation('inbox_reject', 'reject', opts);
    });

  async function runInboxOperation(
    operation: 'inbox_promote' | 'inbox_reject',
    verb: 'promote' | 'reject',
    opts: { id: string; notes?: string; actor?: string },
  ) {
    const command = `cc work-items ${verb}`;
    const ids = String(opts.id).split(',').map((s) => s.trim()).filter(Boolean);
    const done: Array<{ id: string; status: string }> = [];
    const failed: Array<{ id: string; error: string }> = [];
    try {
      const client = createClient(program.opts().url);
      for (const raw of ids) {
        try {
          const fullId = await resolveId(client, raw);
          const body: Record<string, unknown> = { id: fullId, operation };
          if (opts.notes) body.notes = opts.notes;
          if (opts.actor) body.actor = opts.actor;
          const data = await client.patch<UpdateResponse>('/api/work-items', body);
          // Do not report what the server did not confirm.
          const status = data.item?.status;
          const confirmed = verb === 'promote'
            ? data.item?.id === fullId && (data as { promoted?: boolean }).promoted === true
            : status === 'rejected';
          if (!confirmed) {
            failed.push({ id: fullId, error: `Server did not confirm the ${verb}. Check that the Command Center deploy includes the agent inbox, then run \`cc wi get ${fullId.slice(0, 8)}\`.` });
            continue;
          }
          done.push({ id: fullId, status: status ?? '-' });
        } catch (e) {
          if (e instanceof ApiError) {
            failed.push({ id: raw, error: `${e.status}: ${e.body}` });
          } else {
            failed.push({ id: raw, error: e instanceof Error ? e.message : String(e) });
          }
        }
      }
    } catch (e) {
      if (e instanceof ApiError) {
        respondError(command, e.body, String(e.status), 'Check COMMAND_CENTER_API_KEY');
        return;
      }
      throw e;
    }

    if (failed.length > 0 && done.length === 0) {
      respondError(command, failed.map((f) => `${f.id.slice(0, 8)}: ${f.error}`).join(' | '), '422',
        'The item must be waiting in an agent inbox (`cc wi list --inbox`); a reject also needs --notes');
      return;
    }

    respond(command, { updated: done, failed, summary: { requested: ids.length, succeeded: done.length, failed: failed.length } }, [
      { command: 'cc wi list --inbox', description: 'See what is still waiting in the agent inbox' },
    ]);
    if (!isAgent) {
      for (const d of done) console.log(`${verb === 'promote' ? 'Promoted' : 'Rejected'}: ${d.id.slice(0, 8)} -> ${d.status}`);
      for (const f of failed) console.error(`Failed: ${f.id.slice(0, 8)} - ${f.error}`);
    }
  }

  wi.command('snooze')
    .description(
      'Park a work item until a date. It leaves the open list (status deferred) and the ' +
        'daily wake job puts it back on that date. Use for tripwires: nothing to do until then.',
    )
    .requiredOption('-i, --id <id>', 'Work item ID (full UUID or short prefix)')
    .requiredOption('--until <date>', 'Wake date, YYYY-MM-DD, after today (Chicago)')
    .option('--notes <notes>', 'Why it is snoozed (added to the "Snoozed until" note)')
    .option('--actor <actor>', 'Actor name', 'clay')
    .action(async (opts) => {
      try {
        let until: string;
        try {
          until = parseSnoozeUntilFlag(opts.until);
        } catch (parseErr) {
          const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
          respondError('cc work-items snooze', msg, '400', 'Pass a future date, e.g. --until 2027-01-29');
          return;
        }

        const client = createClient(program.opts().url);
        const fullId = await resolveId(client, opts.id);

        // `reason`, not `notes`: a Command Center deploy that predates the
        // snooze operation then rejects this request (400) instead of
        // accepting it as a notes-only update and snoozing nothing.
        const body: Record<string, unknown> = { id: fullId, operation: 'snooze', until };
        if (opts.notes) body.reason = opts.notes;
        if (opts.actor) body.actor = opts.actor;

        const data = await client.patch<SnoozeResponse>('/api/work-items', body);

        // Do not report a snooze the server did not confirm.
        if (data.item?.status !== 'deferred' || data.snooze?.until !== until) {
          respondError(
            'cc work-items snooze',
            `Server did not confirm the snooze of ${fullId} until ${until}. The item was NOT snoozed.`,
            '502',
            'Check that the Command Center deploy includes the snooze operation, then run `cc wi get <id>`',
          );
          return;
        }

        respond('cc work-items snooze', data, [
          { command: `cc wi list --snoozed`, description: 'View snoozed items and their wake dates' },
          { command: `cc wi wake -i ${fullId.slice(0, 8)}`, description: 'Wake it now, before its date' },
        ]);

        if (!isAgent) {
          console.log(`Snoozed: ${fullId.slice(0, 8)} until ${until} (wakes to ${data.snooze?.from_status || 'triaged'})`);
        }
      } catch (e) {
        if (e instanceof ApiError) {
          respondError('cc work-items snooze', e.body, String(e.status),
            e.status === 404 ? 'Check work item ID' :
            e.status === 422 ? 'The date must be after today, and the item must not be done or rejected' :
            'Check the date is YYYY-MM-DD and the Command Center deploy includes the snooze operation');
        }
        throw e;
      }
    });

  wi.command('wake')
    .description('Wake a snoozed work item now, before its date. It returns to the status it had.')
    .requiredOption('-i, --id <id>', 'Work item ID (full UUID or short prefix)')
    .option('--actor <actor>', 'Actor name', 'clay')
    .action(async (opts) => {
      try {
        const client = createClient(program.opts().url);
        const fullId = await resolveId(client, opts.id);

        const body: Record<string, unknown> = { id: fullId, operation: 'wake' };
        if (opts.actor) body.actor = opts.actor;

        const data = await client.patch<SnoozeResponse>('/api/work-items', body);

        if (data.woke !== true || !data.item || data.item.status === 'deferred') {
          respondError(
            'cc work-items wake',
            `Server did not confirm the wake of ${fullId}. The item was NOT woken.`,
            '502',
            'Check that the Command Center deploy includes the wake operation, then run `cc wi get <id>`',
          );
          return;
        }

        respond('cc work-items wake', data, [
          { command: `cc wi get ${fullId.slice(0, 8)}`, description: 'Read the woken item' },
        ]);

        if (!isAgent) {
          console.log(`Woke: ${fullId.slice(0, 8)} → ${data.item.status}`);
        }
      } catch (e) {
        if (e instanceof ApiError) {
          respondError('cc work-items wake', e.body, String(e.status),
            e.status === 404 ? 'Check work item ID' :
            e.status === 422 ? 'Only a snoozed item can be woken. See `cc wi list --snoozed`' :
            'Check the Command Center deploy includes the wake operation');
        }
        throw e;
      }
    });

  wi.command('validate')
    .description(
      'Record a validation run on a work item (POST /api/work-items/<id>/validation). ' +
        'A "finding" item cannot be closed done until a real run is recorded here — ' +
        'see command-center src/lib/server/autonomy-safety.ts getCloseEvidenceBlock.',
    )
    .requiredOption('-i, --id <id>', 'Work item ID (full UUID or short prefix)')
    .requiredOption('--runner <runner>', 'What ran it, e.g. vitest, tsc, manual')
    .requiredOption('--revision <sha>', 'Git revision the run was against')
    .requiredOption('--command <cmd>', 'Exact command that was run')
    .requiredOption('--exit <code>', 'Exit code the command returned (integer; 0 means passed)')
    .option('--notes <notes>', 'Free-text summary of the run (counts, environment, timestamp, etc.)')
    .option('--artifact-url <url>', 'Link to logs/CI output for the run')
    .option('--actor <actor>', 'Actor name', 'clay')
    .action(async (opts) => {
      try {
        let exitCode: number;
        try {
          exitCode = parseExitCodeFlag(opts.exit);
        } catch (parseErr) {
          const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
          respondError('cc work-items validate', msg, '400', 'Pass the integer exit code the command returned, e.g. --exit 0');
          return;
        }

        const client = createClient(program.opts().url);
        const fullId = await resolveId(client, opts.id);

        // status is derived, not a flag: the server (apiValidationRunSchema)
        // rejects status: 'passed' unless exit_code is exactly 0, so there is
        // no honest way for the caller to pick it independently of the code
        // that was actually observed.
        const body: Record<string, unknown> = {
          runner: opts.runner,
          revision: opts.revision,
          command: opts.command,
          status: exitCode === 0 ? 'passed' : 'failed',
          exit_code: exitCode,
        };
        if (opts.notes) body.notes = opts.notes;
        if (opts.artifactUrl) body.artifact_url = opts.artifactUrl;
        if (opts.actor) body.actor = opts.actor;

        const data = await client.post<ValidationRunResponse>(`/api/work-items/${fullId}/validation`, body);

        respond('cc work-items validate', data, [
          { command: `cc wi update -i ${fullId.slice(0, 8)} -s done --notes "..."`, description: 'Close the item now that a validation run is recorded' },
        ]);

        if (!isAgent) {
          console.log(`Recorded ${data.run?.status || body.status} run on ${fullId.slice(0, 8)} — ${opts.runner} @ ${opts.revision} (exit ${exitCode})`);
        }
      } catch (e) {
        if (e instanceof ApiError) {
          respondError('cc work-items validate', e.body, String(e.status),
            e.status === 404 ? 'Check work item ID' :
            e.status === 403 ? 'This key must own or have proposed the item' :
            'Check runner/revision/command/exit fields match the server schema');
        }
        throw e;
      }
    });

  wi.command('bulk-close')
    .description('Close multiple work items')
    .argument('<ids...>', 'Work item IDs')
    .option('-s, --status <status>', 'Close status: done, rejected, deferred', 'done')
    .option('--notes <notes>', 'Closure notes')
    .option('--actor <actor>', 'Actor name', 'clay')
    .action(async (ids, opts) => {
      try {
        const client = createClient(program.opts().url);
        const fullIds = await resolveIds(client, ids);
        const data = await client.patch<UpdateResponse>('/api/work-items', {
          ids: fullIds,
          status: opts.status,
          notes: opts.notes,
          actor: opts.actor,
        });

        respond('cc work-items bulk-close', data, [
          { command: `cc wi list`, description: 'View remaining open items' },
        ]);

        if (!isAgent) {
          console.log(`Closed ${data.summary?.succeeded || 0} of ${data.summary?.requested || 0} items as ${opts.status}`);
        }
      } catch (e) {
        if (e instanceof ApiError) {
          respondError('cc work-items bulk-close', e.body, String(e.status), 'Check IDs and status');
        }
        throw e;
      }
    });

  wi.command('priorities')
    .description('Show open work items grouped by rock (ruling 2026-09-02: rocks are priorities)')
    .option('-p, --project <project>', 'Filter by project')
    .option('--all', 'Include everything cc wi list hides by default (initiative/sprint containers, system items)')
    .option('--assigned-to <who>', 'Filter to one assignee (client-side: /api/work-items/priorities does not accept this param)')
    .action(async (opts) => {
      try {
        const client = createClient(program.opts().url);
        const params = new URLSearchParams();
        if (opts.project) params.set('project', opts.project);
        if (opts.all) params.set('include', 'all');
        const query = params.toString();
        let data = await client.get<PrioritiesResponse>(`/api/work-items/priorities${query ? `?${query}` : ''}`);
        if (opts.assignedTo) data = filterPrioritiesByAssignee(data, opts.assignedTo);

        respond('cc work-items priorities', data, [
          { command: `cc wi list --rock=<rock>`, description: 'List all items in one rock' },
        ]);

        if (!isAgent) {
          console.log(`\n${data.count} open item(s) across ${data.rocks.length} rocks:\n`);
          for (const group of data.rocks) {
            console.log(`${formatRockLabel(group.rock)} (${group.items.length})`);
            if (group.items.length === 0) {
              console.log('  (none)');
            } else {
              table(group.items.map(i => ({
                id: i.id.slice(0, 8),
                status: i.status,
                priority: i.priority || '-',
                type: i.type || '-',
                title: i.title.slice(0, 60),
              })), ['id', 'status', 'priority', 'type', 'title']);
            }
            console.log();
          }

          console.log(`${formatRockLabel(data.serves_no_rock.rock)} — serves_no_rock (${data.serves_no_rock.items.length})`);
          if (data.serves_no_rock.items.length === 0) {
            console.log('  (none)');
          } else {
            table(data.serves_no_rock.items.map(i => ({
              id: i.id.slice(0, 8),
              status: i.status,
              priority: i.priority || '-',
              type: i.type || '-',
              title: i.title.slice(0, 60),
            })), ['id', 'status', 'priority', 'type', 'title']);
          }
        }
      } catch (e) {
        if (e instanceof ApiError) {
          respondError('cc work-items priorities', e.body, String(e.status),
            e.status === 401 ? 'Check COMMAND_CENTER_API_KEY' : 'Check server logs');
        }
        throw e;
      }
    });
}
