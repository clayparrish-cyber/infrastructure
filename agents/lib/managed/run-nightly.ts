#!/usr/bin/env npx tsx
/**
 * Nightly runner — main entry point for the managed-agents pipeline.
 *
 * Flow (one invocation per night):
 *
 *   1. Validate env + ensure pinned agents exist (setupAll).
 *   2. Collect signals via collect-orchestrator-signals.ts.
 *   3. Run the orchestrator session → receive a Roster.
 *   4. Budget guardrail: estimateSpend(roster) vs
 *      MANAGED_AGENTS_MAX_SPEND_USD. Bypass with --force.
 *   5. In parallel (bounded by p-limit), run one reviewer session
 *      per roster entry. Each reviewer writes its own work items
 *      from inside the session via the cc CLI.
 *   6. For each reviewer result, write agent_runs_v2 + agent_state +
 *      agent_activity rows directly (matching the bash pipeline shape).
 *   7. Workers are stubbed behind --with-workers for now (the first
 *      cutover keeps reviewer-only parity with the classic pipeline).
 *   8. Exit 0 if all reviewers succeeded, 1 otherwise.
 *
 * This file is split into: a pure `main(options, deps)` function that
 * dependency-injects every side effect (for tests), and a CLI wrapper
 * at the bottom that only runs when invoked directly via `npx tsx`.
 *
 * Testing strategy: the tests in __tests__/run-nightly.test.ts pass a
 * fake `deps` object. The live wiring happens in `defaultDeps()` which
 * plumbs in the real implementations from setup-agents, orchestrator,
 * reviewer, supabase-writer, and the helper functions below.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pLimit from 'p-limit';

import { getEnv, type ManagedEnv } from './env.js';
import { setupAll, type SetupResult } from './setup-agents.js';
import { runOrchestrator } from './orchestrator.js';
import { runReviewer, type RunReviewerOptions, type RunReviewerResult } from './reviewer.js';
import {
  writeAgentRun,
  upsertAgentState,
  logAgentActivity,
  type WriteAgentRunParams,
  type UpsertAgentStateParams,
  type LogAgentActivityParams,
  type SupabaseWriterClient,
} from './supabase-writer.js';
import type { Roster } from './types.js';

// ---------------------------------------------------------------------------
// CLI options
// ---------------------------------------------------------------------------

export interface RunNightlyOptions {
  dryRun: boolean;
  withWorkers: boolean;
  force: boolean;
  concurrency?: number;
}

/** Parse argv (already sliced to skip node + script). */
export function parseArgs(argv: string[]): RunNightlyOptions {
  const opts: RunNightlyOptions = {
    dryRun: false,
    withWorkers: false,
    force: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--with-workers') opts.withWorkers = true;
    else if (a === '--force') opts.force = true;
    else if (a === '--concurrency') {
      const next = argv[i + 1];
      if (next !== undefined) {
        const n = Number.parseInt(next, 10);
        if (Number.isFinite(n) && n > 0) opts.concurrency = n;
        i++;
      }
    } else if (a?.startsWith('--concurrency=')) {
      const n = Number.parseInt(a.slice('--concurrency='.length), 10);
      if (Number.isFinite(n) && n > 0) opts.concurrency = n;
    }
  }
  return opts;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Trivial ISO date helper. Defaults to "now" but accepts an injected Date. */
export function todayYYYYMMDD(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

interface RegistryProjectEntry {
  repo?: string;
  [key: string]: unknown;
}

interface RegistryFile {
  version?: number;
  projects?: Record<string, RegistryProjectEntry>;
}

/**
 * Resolves a project ID to a full GitHub URL by reading
 * agents/registry.json. The `repo` field is stored as `owner/name`
 * (never a full URL), so we prefix `https://github.com/`.
 *
 * Throws if the project is missing or has no repo field. Callers in
 * run-nightly should let this throw — a roster entry for a nonexistent
 * project is a pipeline bug worth surfacing, not silently skipping.
 */
export function resolveProjectRepoUrl(
  projectId: string,
  registryPath?: string,
): string {
  const path = registryPath ?? defaultRegistryPath();
  let parsed: RegistryFile;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8')) as RegistryFile;
  } catch (err) {
    throw new Error(
      `Failed to read registry at ${path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const entry = parsed.projects?.[projectId];
  if (!entry) {
    throw new Error(
      `Project "${projectId}" not found in ${path}. ` +
        `Roster entry references a project that is not in the registry.`,
    );
  }
  if (!entry.repo || typeof entry.repo !== 'string') {
    throw new Error(
      `Project "${projectId}" in registry has no "repo" field.`,
    );
  }
  return `https://github.com/${entry.repo}`;
}

function defaultRegistryPath(): string {
  // This file lives at <repo>/agents/lib/managed/run-nightly.ts.
  // Registry is at <repo>/agents/registry.json.
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..', 'registry.json');
}

/**
 * Mints a GitHub App installation token for a repo.
 *
 * Strategy: in CI we do NOT mint tokens in-process. The workflow uses
 * `actions/create-github-app-token@v1` to generate one installation
 * token scoped to the `clayparrish-cyber` owner, then exports it as
 * GH_APP_INSTALLATION_TOKEN. This function simply reads that env var
 * and returns it — all our project repos live under the same owner, so
 * one token works for every reviewer session.
 *
 * Local fallback: if GH_APP_INSTALLATION_TOKEN is unset, we use
 * GITHUB_TOKEN (classic PAT) if present. If neither is set, throw.
 *
 * This sidesteps a 150+ line JWT → installations → access_tokens flow
 * that would duplicate what actions/create-github-app-token already
 * does perfectly in the workflow layer.
 */
export async function mintGithubAppToken(_repoUrl: string): Promise<string> {
  const installTok = process.env.GH_APP_INSTALLATION_TOKEN;
  if (installTok && installTok.trim() !== '') return installTok;
  const pat = process.env.GITHUB_TOKEN;
  if (pat && pat.trim() !== '') return pat;
  throw new Error(
    'No GitHub token available. In CI, actions/create-github-app-token ' +
      'should set GH_APP_INSTALLATION_TOKEN. Locally, set GITHUB_TOKEN.',
  );
}

/**
 * Estimates the USD spend for a given roster based on the last 7 days
 * of agent_runs_v2. For each entry we look up the average cost of
 * (agent_id, project) pairs in history; if no history exists, we fall
 * back to $0.50 per entry as a rough per-session floor.
 *
 * This is intentionally cheap: one SELECT + in-memory math. It runs
 * once per nightly run and exists only to stop us from nuking the
 * budget if the orchestrator returns an unexpectedly large roster.
 */
export async function estimateSpend(
  roster: Roster,
  supabase?: SupabaseWriterClient,
): Promise<number> {
  if (roster.roster.length === 0) return 0;

  // Fallback estimator if we don't have a supabase client: $0.50/entry.
  if (!supabase) {
    const { getSupabase } = await import('./sdk.js');
    try {
      supabase = getSupabase() as unknown as SupabaseWriterClient;
    } catch {
      return roster.roster.length * 0.5;
    }
  }

  // Pull the last 7 days of runs once.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  let rows: Array<{ agent_id: string; project: string; cost_estimate: number }> = [];
  try {
    // Supabase's real client exposes .from(table).select(cols).gte(...),
    // but our narrow SupabaseWriterClient only models insert/upsert/select(...).
    // We escape to `any` here because the real client supports the chain
    // and this helper is glue code for the cron path, not a hot loop.
    const anyClient = supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          gte: (col: string, val: string) => Promise<{
            data:
              | Array<{ agent_id: string; project: string; cost_estimate: number | null }>
              | null;
            error: unknown;
          }>;
        };
      };
    };
    const { data } = await anyClient
      .from('agent_runs_v2')
      .select('agent_id, project, cost_estimate')
      .gte('started_at', sevenDaysAgo.toISOString());
    rows = (data ?? [])
      .filter((r) => r.cost_estimate !== null && r.cost_estimate !== undefined)
      .map((r) => ({
        agent_id: r.agent_id,
        project: r.project,
        cost_estimate: Number(r.cost_estimate),
      }));
  } catch {
    return roster.roster.length * 0.5;
  }

  // Build (agent, project) → average cost.
  const totals = new Map<string, { sum: number; n: number }>();
  for (const r of rows) {
    const key = `${r.agent_id}|${r.project}`;
    const cur = totals.get(key) ?? { sum: 0, n: 0 };
    cur.sum += r.cost_estimate;
    cur.n += 1;
    totals.set(key, cur);
  }

  let estimate = 0;
  for (const entry of roster.roster) {
    const key = `${entry.agent_id}|${entry.project}`;
    const hist = totals.get(key);
    estimate += hist && hist.n > 0 ? hist.sum / hist.n : 0.5;
  }
  return estimate;
}

/**
 * Spawns agents/lib/collect-orchestrator-signals.ts in a subprocess,
 * pointing SIGNALS_OUTPUT at a temp file, waits for it, and returns
 * the file contents as a string.
 *
 * The script writes to a file (not stdout), so stdout is just status
 * logging and is streamed straight to our stderr for debugging.
 */
export async function collectSignals(): Promise<string> {
  const tmp = mkdtempSync(join(tmpdir(), 'managed-signals-'));
  const outPath = join(tmp, 'signals.json');
  try {
    const scriptPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      'collect-orchestrator-signals.ts',
    );
    const result = spawnSync('npx', ['tsx', scriptPath], {
      env: { ...process.env, SIGNALS_OUTPUT: outPath },
      encoding: 'utf8',
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    if (result.status !== 0) {
      throw new Error(
        `collect-orchestrator-signals.ts exited with code ${result.status}`,
      );
    }
    return readFileSync(outPath, 'utf8');
  } finally {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

// ---------------------------------------------------------------------------
// Dependency injection shape — every side effect is injectable so tests
// can stub with fakes. The CLI wrapper wires the real functions in.
// ---------------------------------------------------------------------------

export interface RunNightlyLogger {
  info: (msg: string, ...rest: unknown[]) => void;
  warn: (msg: string, ...rest: unknown[]) => void;
  error: (msg: string, ...rest: unknown[]) => void;
}

export interface RunNightlyDeps {
  getEnv: () => ManagedEnv;
  setupAll: () => Promise<SetupResult>;
  collectSignals: () => Promise<string>;
  runOrchestrator: (
    agentId: string,
    envId: string,
    signalsJson: string,
  ) => Promise<Roster>;
  runReviewer: (opts: RunReviewerOptions) => Promise<RunReviewerResult>;
  writeAgentRun: (params: WriteAgentRunParams) => Promise<void>;
  upsertAgentState: (params: UpsertAgentStateParams) => Promise<void>;
  logAgentActivity: (params: LogAgentActivityParams) => Promise<void>;
  resolveProjectRepoUrl: (projectId: string) => string;
  mintGithubAppToken: (repoUrl: string) => Promise<string>;
  estimateSpend: (roster: Roster) => Promise<number>;
  now: () => number;
  logger: RunNightlyLogger;
}

export function defaultDeps(): RunNightlyDeps {
  return {
    getEnv,
    setupAll,
    collectSignals,
    runOrchestrator,
    runReviewer,
    writeAgentRun,
    upsertAgentState,
    logAgentActivity,
    resolveProjectRepoUrl: (pid: string) => resolveProjectRepoUrl(pid),
    mintGithubAppToken,
    estimateSpend: (roster: Roster) => estimateSpend(roster),
    now: () => Date.now(),
    logger: {
      info: (msg, ...rest) => console.log(msg, ...rest),
      warn: (msg, ...rest) => console.warn(msg, ...rest),
      error: (msg, ...rest) => console.error(msg, ...rest),
    },
  };
}

// ---------------------------------------------------------------------------
// main — the pure, testable entry point. Returns an exit code.
// ---------------------------------------------------------------------------

export async function main(
  options: RunNightlyOptions,
  deps: RunNightlyDeps,
): Promise<number> {
  const date = todayYYYYMMDD(new Date(deps.now()));
  const env = deps.getEnv();

  deps.logger.info(`[${date}] managed-agents nightly runner starting`);
  deps.logger.info(
    `[${date}] options: dryRun=${options.dryRun} withWorkers=${options.withWorkers} force=${options.force} concurrency=${options.concurrency ?? env.MANAGED_AGENTS_CONCURRENCY}`,
  );

  // 1. Ensure agents + env exist.
  const setup = await deps.setupAll();
  deps.logger.info(
    `[${date}] setup: envId=${setup.envId} orchestrator=${setup.orchestratorId} reviewer=${setup.reviewerId} worker=${setup.workerId}`,
  );

  // 2. Collect signals.
  const signalsJson = await deps.collectSignals();
  deps.logger.info(
    `[${date}] signals collected (${signalsJson.length} bytes)`,
  );

  // 3. Orchestrator.
  const roster = await deps.runOrchestrator(
    setup.orchestratorId,
    setup.envId,
    signalsJson,
  );
  deps.logger.info(
    `[${date}] Roster: ${roster.roster.length} entries, ${roster.skipped.length} skipped`,
  );

  if (roster.roster.length === 0) {
    deps.logger.info(`[${date}] empty roster — nothing to review, exiting 0`);
    return 0;
  }

  // 4. Budget guardrail.
  const estimate = await deps.estimateSpend(roster);
  const cap = env.MANAGED_AGENTS_MAX_SPEND_USD;
  deps.logger.info(
    `[${date}] spend estimate: $${estimate.toFixed(2)} (cap $${cap.toFixed(2)})`,
  );
  if (estimate > cap && !options.force) {
    deps.logger.error(
      `[${date}] BUDGET GUARDRAIL tripped: $${estimate.toFixed(2)} > $${cap.toFixed(2)}. ` +
        `Re-run with --force to bypass.`,
    );
    return 1;
  }

  // 5. Parallel reviewers.
  const concurrency = options.concurrency ?? env.MANAGED_AGENTS_CONCURRENCY;
  const limit = pLimit(concurrency);

  const results = await Promise.all(
    roster.roster.map((entry) =>
      limit(async () => {
        const start = deps.now();
        try {
          const projectRepoUrl = deps.resolveProjectRepoUrl(entry.project);
          const authToken = await deps.mintGithubAppToken(projectRepoUrl);

          const result = await deps.runReviewer({
            reviewerAgentId: setup.reviewerId,
            envId: setup.envId,
            entry,
            projectRepoUrl,
            authToken,
            dryRun: options.dryRun,
          });

          const durationMs = deps.now() - start;

          await deps.writeAgentRun({
            agentId: entry.agent_id,
            project: entry.project,
            usage: result.usage,
            findingsCount: result.findingsCount,
            trigger: options.dryRun ? 'dryrun' : 'orchestrator',
            durationMs,
          });

          await deps.upsertAgentState({
            agentId: entry.agent_id,
            project: entry.project,
            date,
            runSummary: {
              findings_count: result.findingsCount,
              key_findings: [],
              summary: `Reviewed ${entry.project} — ${result.findingsCount} findings`,
            },
            activeFindingIds: [],
          });

          await deps.logAgentActivity({
            agentId: entry.agent_id,
            project: entry.project,
            action: 'report_synced',
            details: {
              findings_count: result.findingsCount,
              dry_run: options.dryRun,
            },
          });

          deps.logger.info(
            `[${date}] OK ${entry.agent_id}@${entry.project} — ${result.findingsCount} findings in ${durationMs}ms`,
          );
          return {
            ok: true as const,
            entry,
            findings: result.findingsCount,
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          deps.logger.error(
            `[${date}] REVIEWER FAILED: ${entry.agent_id}@${entry.project}: ${msg}`,
          );
          return {
            ok: false as const,
            entry,
            error: msg,
          };
        }
      }),
    ),
  );

  // 6. Workers — stub for now. First cutover runs reviewer-only parity.
  if (options.withWorkers) {
    deps.logger.info(
      `[${date}] --with-workers set, but worker dispatch is STUBBED for the initial managed-agents cutover. Skipping worker pass.`,
    );
  }

  // 7. Summary.
  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.length - succeeded;
  deps.logger.info(
    `[${date}] SUMMARY: ${succeeded} succeeded, ${failed} failed, ${results.length} total`,
  );

  return failed > 0 ? 1 : 0;
}

// ---------------------------------------------------------------------------
// CLI wrapper
// ---------------------------------------------------------------------------

async function cliMain(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const code = await main(opts, defaultDeps());
  process.exit(code);
}

// Run only when invoked directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  cliMain().catch((err) => {
    console.error('[run-nightly] fatal:', err);
    process.exit(1);
  });
}
