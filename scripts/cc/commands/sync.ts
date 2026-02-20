import type { Command } from 'commander';
import { createClient, ApiError } from '../lib/client.js';
import { respond, respondError, isAgent } from '../lib/envelope.js';

export function registerSync(program: Command) {
  const sync = program.command('sync').description('Sync integrations and data sources');

  sync.command('app-store')
    .description('Sync App Store Connect metrics (downloads, revenue)')
    .option('--date <date>', 'Report date (YYYY-MM-DD)', new Date().toISOString().slice(0, 10))
    .action(async (opts) => {
      try {
        const client = createClient(program.opts().url);
        const data = await client.post<{ success: boolean; inserted: number; errors: string[] }>(
          '/api/integrations/app-store/sync',
          { reportDate: opts.date }
        );

        respond('cc sync app-store', data, [
          { command: `cc sync meta-ads`, description: 'Also sync Meta Ads data' },
          { command: `cc sync glossy-feedback`, description: 'Sync Glossy Sports feedback' },
        ]);

        if (!isAgent) {
          console.log(`App Store sync: ${data.inserted} metrics inserted`);
          if (data.errors?.length > 0) {
            for (const err of data.errors) console.error(`  Error: ${err}`);
          }
        }
      } catch (e) {
        if (e instanceof ApiError) {
          respondError('cc sync app-store', e.body, String(e.status),
            e.status === 403 ? 'Admin access required' : 'Check ASC credentials');
        }
        throw e;
      }
    });

  sync.command('meta-ads')
    .description('Sync Meta ad campaign metrics')
    .option('-m, --month <month>', 'Month (YYYY-MM)', new Date().toISOString().slice(0, 7))
    .action(async (opts) => {
      try {
        const client = createClient(program.opts().url);
        const data = await client.post<{ success: boolean; inserted: number; errors: string[] }>(
          '/api/integrations/meta-ads/sync',
          { month: opts.month }
        );

        respond('cc sync meta-ads', data, [
          { command: `cc sync app-store`, description: 'Also sync App Store data' },
        ]);

        if (!isAgent) {
          console.log(`Meta Ads sync: ${data.inserted} metrics inserted for ${opts.month}`);
        }
      } catch (e) {
        if (e instanceof ApiError) {
          respondError('cc sync meta-ads', e.body, String(e.status),
            e.status === 403 ? 'Admin access required' : 'Check Meta API credentials');
        }
        throw e;
      }
    });

  sync.command('glossy-feedback')
    .description('Sync Glossy Sports user feedback into Command Center')
    .action(async () => {
      try {
        const client = createClient(program.opts().url);
        const data = await client.post<{ message: string; synced?: number }>(
          '/api/sync/glossy-feedback', {}
        );

        respond('cc sync glossy-feedback', data, [
          { command: `cc sync glossy-feedback-status`, description: 'Check sync status' },
          { command: `cc wi list --project=glossy-sports`, description: 'View Glossy work items' },
        ]);

        if (!isAgent) {
          console.log(data.message);
        }
      } catch (e) {
        if (e instanceof ApiError) {
          respondError('cc sync glossy-feedback', e.body, String(e.status), 'Check API key');
        }
        throw e;
      }
    });

  sync.command('glossy-feedback-status')
    .description('Check Glossy Sports feedback sync status')
    .action(async () => {
      try {
        const client = createClient(program.opts().url);
        const data = await client.get<{ glossy_feedback_count: number; synced_to_dashboard: number; pending: number }>(
          '/api/sync/glossy-feedback'
        );

        respond('cc sync glossy-feedback-status', data, [
          ...(data.pending > 0
            ? [{ command: `cc sync glossy-feedback`, description: `Sync ${data.pending} pending items` }]
            : []),
        ]);

        if (!isAgent) {
          console.log(`Glossy feedback: ${data.glossy_feedback_count} total, ${data.synced_to_dashboard} synced, ${data.pending} pending`);
        }
      } catch (e) {
        if (e instanceof ApiError) {
          respondError('cc sync glossy-feedback-status', e.body, String(e.status), 'Check API key');
        }
        throw e;
      }
    });

  sync.command('loop-closure')
    .description('Run loop closure sweep (consolidate agent findings)')
    .action(async () => {
      try {
        const client = createClient(program.opts().url);
        const data = await client.post<{ message: string; created: number; reused: number; skipped: number }>(
          '/api/loop-closure/sweep', {}
        );

        respond('cc sync loop-closure', data, [
          { command: `cc wi list --status=discovered`, description: 'View new findings' },
        ]);

        if (!isAgent) {
          console.log(data.message);
        }
      } catch (e) {
        if (e instanceof ApiError) {
          respondError('cc sync loop-closure', e.body, String(e.status),
            e.status === 403 ? 'Admin access required' : 'Check API key');
        }
        throw e;
      }
    });
}
