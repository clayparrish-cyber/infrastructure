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

interface WorkItem {
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
  created_at: string;
  updated_at: string;
}

const UUID_LENGTH = 36;

/**
 * Resolve a short ID prefix (e.g. "5d5bf4fe") to a full UUID by fetching
 * the work item list and matching by prefix. Returns the ID unchanged if
 * it's already a full UUID.
 */
async function resolveId(client: ReturnType<typeof createClient>, shortId: string): Promise<string> {
  if (shortId.length >= UUID_LENGTH) return shortId;

  const data = await client.get<ListResponse>('/api/work-items?limit=200');
  const matches = data.items.filter(i => i.id.startsWith(shortId));

  if (matches.length === 0) {
    throw new Error(`No work item found matching short ID "${shortId}"`);
  }
  if (matches.length > 1) {
    throw new Error(`Ambiguous short ID "${shortId}" — matches ${matches.length} items. Use a longer prefix.`);
  }
  return matches[0].id;
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

async function resolveIds(client: ReturnType<typeof createClient>, ids: string[]): Promise<string[]> {
  const needsResolve = ids.some(id => id.length < UUID_LENGTH);
  if (!needsResolve) return ids;

  const data = await client.get<ListResponse>('/api/work-items?limit=200');
  return ids.map(shortId => {
    if (shortId.length >= UUID_LENGTH) return shortId;
    const matches = data.items.filter(i => i.id.startsWith(shortId));
    if (matches.length === 0) throw new Error(`No work item found matching short ID "${shortId}"`);
    if (matches.length > 1) throw new Error(`Ambiguous short ID "${shortId}" — matches ${matches.length} items.`);
    return matches[0].id;
  });
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

interface RockGroup {
  rock: string;
  items: WorkItem[];
}

interface PrioritiesResponse {
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

export function registerWorkItems(program: Command) {
  const wi = program.command('work-items').alias('wi').description('Manage work items');

  wi.command('list')
    .description('List work items')
    .option('-p, --project <project>', 'Filter by project')
    .option('-s, --status <status>', 'Filter by status (comma-separated)', 'discovered,triaged,approved,in_progress,review')
    .option('-l, --limit <n>', 'Max results', '50')
    .option('--type <type>', 'Filter by type (comma-separated)')
    .option('--rock <rock>', 'Filter by rock: prepare-gt-2027, raise-capital, 500-doors, national-brand, third-flavor, none')
    .option('--include-initiatives', 'Include initiative/sprint container items (excluded by default)')
    .action(async (opts) => {
      try {
        const client = createClient(program.opts().url);
        const params = new URLSearchParams();
        if (opts.project) params.set('project', opts.project);
        if (opts.status) params.set('status', opts.status);
        if (opts.limit) params.set('limit', opts.limit);
        if (opts.rock) params.set('rock', opts.rock);
        if (opts.type) {
          params.set('type', opts.type);
        } else if (!opts.includeInitiatives) {
          params.set('exclude_type', 'initiative');
        }

        const data = await client.get<ListResponse>(`/api/work-items?${params}`);

        respond('cc work-items list', data, [
          { command: `cc wi list --status=done --limit=10`, description: 'View completed items' },
          { command: `cc wi create --title "New task" --project mainline-apps`, description: 'Create a new work item' },
        ]);

        if (!isAgent) {
          console.log(`\n${data.count} work items:\n`);
          table(data.items.map(i => ({
            id: i.id.slice(0, 8),
            status: i.status,
            priority: i.priority || '-',
            project: i.project || '-',
            rock: i.rock || 'none',
            title: i.title.slice(0, 60),
            notes: i.recent_notes?.length ? String(i.recent_notes.length) : '-',
          })), ['id', 'status', 'priority', 'project', 'rock', 'title', 'notes']);

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
    .action(async (opts) => {
      try {
        const client = createClient(program.opts().url);
        const params = new URLSearchParams();
        if (opts.project) params.set('project', opts.project);
        if (opts.all) params.set('include', 'all');
        const query = params.toString();
        const data = await client.get<PrioritiesResponse>(`/api/work-items/priorities${query ? `?${query}` : ''}`);

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
