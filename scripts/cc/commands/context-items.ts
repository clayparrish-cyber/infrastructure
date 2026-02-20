import type { Command } from 'commander';
import { createClient, ApiError } from '../lib/client.js';
import { respond, respondError, isAgent } from '../lib/envelope.js';

interface ContextItemResponse {
  context_item_id: string;
  work_item_ids: string[];
  summary: string;
  is_relevant: boolean;
}

export function registerContextItems(program: Command) {
  const ctx = program.command('context').alias('ctx').description('Ingest context items (meeting notes, emails)');

  ctx.command('ingest')
    .description('Ingest text content — AI extracts summary, action items, and spawns work items')
    .requiredOption('-c, --content <text>', 'Raw text content')
    .option('-s, --source <source>', 'Source type: email, meeting, feedback', 'meeting')
    .option('-p, --project <project>', 'Project name (auto-detected if omitted)')
    .option('--account <account>', 'Source account (email or meeting ID)')
    .option('--people <people>', 'Comma-separated names of people involved')
    .action(async (opts) => {
      try {
        const client = createClient(program.opts().url);
        const body: Record<string, unknown> = {
          source: opts.source,
          content: opts.content,
        };
        if (opts.project) body.project = opts.project;
        if (opts.account) body.source_account = opts.account;
        if (opts.people) body.people = opts.people.split(',').map((p: string) => p.trim());

        const data = await client.post<ContextItemResponse>('/api/context-items', body);

        respond('cc context ingest', data, [
          ...(data.work_item_ids.length > 0
            ? [{ command: `cc wi list --status=discovered`, description: 'View spawned work items' }]
            : []),
          { command: `cc context ingest --source=email --content "..."`, description: 'Ingest another item' },
        ]);

        if (!isAgent) {
          console.log(`Ingested: ${data.context_item_id.slice(0, 8)}`);
          console.log(`Relevant: ${data.is_relevant ? 'yes' : 'no'}`);
          console.log(`Summary: ${data.summary}`);
          if (data.work_item_ids.length > 0) {
            console.log(`Work items created: ${data.work_item_ids.length}`);
          }
        }
      } catch (e) {
        if (e instanceof ApiError) {
          respondError('cc context ingest', e.body, String(e.status),
            e.status === 401 ? 'Check COMMAND_CENTER_API_KEY' : 'Check content field');
        }
        throw e;
      }
    });

  ctx.command('ingest-file')
    .description('Ingest content from a file')
    .argument('<file>', 'Path to text file')
    .option('-s, --source <source>', 'Source type: email, meeting, feedback', 'meeting')
    .option('-p, --project <project>', 'Project name')
    .option('--people <people>', 'Comma-separated names')
    .action(async (file, opts) => {
      try {
        const fs = await import('fs');
        const content = fs.readFileSync(file, 'utf8');
        const client = createClient(program.opts().url);

        const body: Record<string, unknown> = {
          source: opts.source,
          content,
        };
        if (opts.project) body.project = opts.project;
        if (opts.people) body.people = opts.people.split(',').map((p: string) => p.trim());

        const data = await client.post<ContextItemResponse>('/api/context-items', body);

        respond('cc context ingest-file', data, [
          { command: `cc wi list --status=discovered`, description: 'View spawned work items' },
        ]);

        if (!isAgent) {
          console.log(`Ingested from ${file}: ${data.context_item_id.slice(0, 8)}`);
          console.log(`Summary: ${data.summary}`);
          console.log(`Work items: ${data.work_item_ids.length}`);
        }
      } catch (e) {
        if (e instanceof ApiError) {
          respondError('cc context ingest-file', e.body, String(e.status), 'Check file path and API key');
        }
        throw e;
      }
    });
}
