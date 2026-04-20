import type { Command } from 'commander';
import { createClient, ApiError } from '../lib/client.js';
import { respond, respondError, table, isAgent } from '../lib/envelope.js';

interface WorkItem {
  id: string;
  title: string;
  description?: string;
  project?: string;
  status: string;
  priority?: string;
  type?: string;
  source_type?: string;
  assigned_to?: string;
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

export function registerWorkItems(program: Command) {
  const wi = program.command('work-items').alias('wi').description('Manage work items');

  wi.command('list')
    .description('List work items')
    .option('-p, --project <project>', 'Filter by project')
    .option('-s, --status <status>', 'Filter by status (comma-separated)', 'discovered,triaged,approved,in_progress,review')
    .option('-l, --limit <n>', 'Max results', '50')
    .option('--type <type>', 'Filter by type (comma-separated)')
    .option('--include-initiatives', 'Include initiative/sprint container items (excluded by default)')
    .action(async (opts) => {
      try {
        const client = createClient(program.opts().url);
        const params = new URLSearchParams();
        if (opts.project) params.set('project', opts.project);
        if (opts.status) params.set('status', opts.status);
        if (opts.limit) params.set('limit', opts.limit);
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
            title: i.title.slice(0, 60),
          })), ['id', 'status', 'priority', 'project', 'title']);
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

  wi.command('update')
    .description('Update a work item')
    .requiredOption('-i, --id <id>', 'Work item ID')
    .option('-s, --status <status>', 'New status')
    .option('--assigned-to <who>', 'Assign to')
    .option('--notes <notes>', 'Notes/comment')
    .option('--actor <actor>', 'Actor name', 'clay')
    .action(async (opts) => {
      try {
        const client = createClient(program.opts().url);
        const fullId = await resolveId(client, opts.id);

        // Use the worker-update schema (id singular) which supports all statuses,
        // rather than bulk-close schema (ids array) which only allows done/rejected/deferred.
        const body: Record<string, unknown> = { id: fullId };
        if (opts.status) body.status = opts.status;
        if (opts.assignedTo) body.assigned_to = opts.assignedTo;
        if (opts.notes) body.notes = opts.notes;
        if (opts.actor) body.actor = opts.actor;

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
}
