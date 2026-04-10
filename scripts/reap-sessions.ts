#!/usr/bin/env npx tsx
/**
 * Session reaper — observability cron for the managed-agents pipeline.
 *
 * Lists every managed-agents session via the Anthropic beta SDK and
 * archives any session older than 2 hours that is still in `running`
 * or `idle` status. Sessions in `terminated` status are already done;
 * `rescheduling` is treated as transient and left alone.
 *
 * This runs hourly from .github/workflows/reap-sessions.yml. It exits
 * 0 regardless of per-session archive failures — the goal is "eventually
 * consistent cleanup", not "fail the whole pipeline if one archive
 * errors". Per-session errors are logged so they show up in the job log.
 *
 * Usage:
 *   npx tsx scripts/reap-sessions.ts            # archive stale
 *   npx tsx scripts/reap-sessions.ts --dry-run  # list only, do not archive
 *
 * The module exports `reapSessions(opts)` so it can be tested with a
 * fake client. The CLI wrapper at the bottom only runs when invoked
 * directly.
 */

import Anthropic from '@anthropic-ai/sdk';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BETAS = ['managed-agents-2026-04-01'] as const;
const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

// ---------------------------------------------------------------------------
// Narrow client shape for tests — enough to list + archive.
// ---------------------------------------------------------------------------

export type ReaperSessionStatus =
  | 'rescheduling'
  | 'running'
  | 'idle'
  | 'terminated';

export interface ReaperSession {
  id: string;
  status: ReaperSessionStatus;
  created_at: string;
}

export interface ReaperClient {
  beta: {
    sessions: {
      list: (
        params?: { betas?: readonly string[] },
      ) => Promise<AsyncIterable<ReaperSession>> | AsyncIterable<ReaperSession>;
      archive: (
        sessionId: string,
        params?: { betas?: readonly string[] },
      ) => Promise<unknown>;
    };
  };
}

export interface ReaperLogger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
}

// ---------------------------------------------------------------------------
// reapSessions — pure, testable
// ---------------------------------------------------------------------------

export interface ReapSessionsOptions {
  client: ReaperClient;
  now?: () => number;
  dryRun?: boolean;
  logger?: ReaperLogger;
}

export interface ReapSessionsResult {
  /** All stale sessions that matched the 2h + running/idle filter. */
  candidates: ReaperSession[];
  /** Stale sessions we successfully archived (empty in --dry-run). */
  archived: ReaperSession[];
  /** Stale sessions whose archive call threw. */
  failed: Array<{ session: ReaperSession; error: string }>;
}

function defaultLogger(): ReaperLogger {
  return {
    info: (m) => console.log(m),
    warn: (m) => console.warn(m),
    error: (m) => console.error(m),
  };
}

export async function reapSessions(
  opts: ReapSessionsOptions,
): Promise<ReapSessionsResult> {
  const now = opts.now ?? (() => Date.now());
  const logger = opts.logger ?? defaultLogger();
  const dryRun = opts.dryRun ?? false;

  const candidates: ReaperSession[] = [];
  const archived: ReaperSession[] = [];
  const failed: Array<{ session: ReaperSession; error: string }> = [];

  // 1. Walk every session page (the real SDK paginator returns an
  //    async-iterable; our fake clients return one too, so the loop is
  //    identical in prod and test).
  const iterableOrPromise = opts.client.beta.sessions.list({ betas: BETAS });
  const iterable = (await Promise.resolve(
    iterableOrPromise,
  )) as AsyncIterable<ReaperSession>;

  const nowMs = now();

  let total = 0;
  for await (const session of iterable) {
    total += 1;

    // Skip sessions that are already terminated — they need no cleanup.
    if (session.status !== 'running' && session.status !== 'idle') continue;

    const ageMs = nowMs - Date.parse(session.created_at);
    if (!Number.isFinite(ageMs) || ageMs < STALE_THRESHOLD_MS) continue;

    candidates.push(session);
  }

  logger.info(
    `[reap-sessions] scanned ${total} sessions, ${candidates.length} stale candidates`,
  );

  if (dryRun) {
    for (const s of candidates) {
      logger.info(
        `[reap-sessions] DRY RUN would archive ${s.id} (status=${s.status}, created_at=${s.created_at})`,
      );
    }
    return { candidates, archived, failed };
  }

  // 2. Archive each candidate. Per-session errors do NOT stop the sweep.
  for (const session of candidates) {
    try {
      await opts.client.beta.sessions.archive(session.id, { betas: BETAS });
      archived.push(session);
      logger.info(
        `[reap-sessions] archived ${session.id} (status=${session.status}, created_at=${session.created_at})`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failed.push({ session, error: msg });
      logger.error(
        `[reap-sessions] failed to archive ${session.id}: ${msg}`,
      );
    }
  }

  return { candidates, archived, failed };
}

// ---------------------------------------------------------------------------
// CLI wrapper
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): { dryRun: boolean } {
  return { dryRun: argv.includes('--dry-run') };
}

async function cliMain(): Promise<void> {
  const { dryRun } = parseArgs(process.argv.slice(2));
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[reap-sessions] ANTHROPIC_API_KEY is required');
    process.exit(0); // exit 0 — observability cron, not critical
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = new Anthropic({ apiKey }) as unknown as ReaperClient;

  try {
    const result = await reapSessions({ client, dryRun });
    console.log(
      `[reap-sessions] summary: candidates=${result.candidates.length} archived=${result.archived.length} failed=${result.failed.length}`,
    );
  } catch (err) {
    console.error('[reap-sessions] fatal:', err);
  }
  // Always exit 0 — this is an observability cron.
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  cliMain().catch((err) => {
    console.error('[reap-sessions] fatal:', err);
    process.exit(0);
  });
}
