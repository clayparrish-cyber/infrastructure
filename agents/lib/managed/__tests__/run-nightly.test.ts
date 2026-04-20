import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  main,
  parseArgs,
  todayYYYYMMDD,
  type RunNightlyDeps,
  type RunNightlyOptions,
} from '../run-nightly.js';
import type { Roster, RosterEntry, SessionUsage } from '../types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FAKE_ENV = {
  ANTHROPIC_API_KEY: 'sk-ant-test',
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'srv_test',
  COMMAND_CENTER_API_KEY: 'cc_test',
  GH_APP_ID: '12345',
  GH_APP_PRIVATE_KEY: 'fake-key',
  MANAGED_AGENTS_CONCURRENCY: 4,
  MANAGED_AGENTS_MAX_SPEND_USD: 20,
  SESSION_TIMEOUT_SEC: 1200,
};

const FAKE_USAGE: SessionUsage = {
  executor_input_tokens: 10_000,
  executor_output_tokens: 1_500,
  advisor_input_tokens: 2_000,
  advisor_output_tokens: 300,
  cache_read_tokens: 0,
  cache_creation_tokens: 0,
  total_cost_usd: 0.05,
  duration_ms: 12_000,
};

const ENTRY_A: RosterEntry = {
  agent_id: 'security-review',
  project: 'sidelineiq',
  priority: 'high',
  reason: 'touched auth',
};
const ENTRY_B: RosterEntry = {
  agent_id: 'bug-hunt-review',
  project: 'dosie',
  priority: 'medium',
  reason: 'stale',
};

const TWO_ENTRY_ROSTER: Roster = {
  roster: [ENTRY_A, ENTRY_B],
  skipped: [],
  signals_summary: 'test',
};

interface Call {
  name: string;
  args: unknown[];
}

function makeDeps(overrides: Partial<RunNightlyDeps> = {}): {
  deps: RunNightlyDeps;
  calls: Call[];
} {
  const calls: Call[] = [];
  const record = (name: string) => (...args: unknown[]) => {
    calls.push({ name, args });
  };

  const deps: RunNightlyDeps = {
    getEnv: () => FAKE_ENV,
    setupAll: async () => {
      calls.push({ name: 'setupAll', args: [] });
      return {
        envId: 'env_123',
        orchestratorId: 'agent_orch_abc',
        reviewerId: 'agent_rev_abc',
        workerId: 'agent_wrk_abc',
      };
    },
    collectSignals: async () => {
      calls.push({ name: 'collectSignals', args: [] });
      return '{"fake":"signals"}';
    },
    runOrchestrator: async (...args) => {
      calls.push({ name: 'runOrchestrator', args });
      return TWO_ENTRY_ROSTER;
    },
    runReviewer: async (opts) => {
      calls.push({ name: 'runReviewer', args: [opts] });
      return {
        findingsCount: 2,
        usage: FAKE_USAGE,
        sessionId: `sesn_${(opts as { entry: RosterEntry }).entry.agent_id}`,
      };
    },
    writeAgentRun: async (...args) => {
      calls.push({ name: 'writeAgentRun', args });
    },
    upsertAgentState: async (...args) => {
      calls.push({ name: 'upsertAgentState', args });
    },
    logAgentActivity: async (...args) => {
      calls.push({ name: 'logAgentActivity', args });
    },
    resolveProjectRepoUrl: (projectId: string) =>
      `https://github.com/clayparrish-cyber/${projectId}`,
    mintGithubAppToken: async (repoUrl: string) => {
      calls.push({ name: 'mintGithubAppToken', args: [repoUrl] });
      return 'ghs_faketoken';
    },
    estimateSpend: async () => {
      calls.push({ name: 'estimateSpend', args: [] });
      return 0.5;
    },
    now: () => 1_700_000_000_000,
    logger: {
      info: record('log.info'),
      warn: record('log.warn'),
      error: record('log.error'),
    },
    ...overrides,
  };
  return { deps, calls };
}

const BASE_OPTS: RunNightlyOptions = {
  dryRun: false,
  withWorkers: false,
  force: false,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('parseArgs handles defaults', () => {
  const opts = parseArgs([]);
  assert.equal(opts.dryRun, false);
  assert.equal(opts.withWorkers, false);
  assert.equal(opts.force, false);
  assert.equal(opts.concurrency, undefined);
});

test('parseArgs handles --dry-run, --with-workers, --force, --concurrency', () => {
  const opts = parseArgs(['--dry-run', '--with-workers', '--force', '--concurrency', '2']);
  assert.equal(opts.dryRun, true);
  assert.equal(opts.withWorkers, true);
  assert.equal(opts.force, true);
  assert.equal(opts.concurrency, 2);
});

test('parseArgs handles --concurrency=N form', () => {
  const opts = parseArgs(['--concurrency=3']);
  assert.equal(opts.concurrency, 3);
});

test('todayYYYYMMDD returns ISO date slice', () => {
  const d = todayYYYYMMDD(new Date('2026-04-09T12:34:56Z'));
  assert.equal(d, '2026-04-09');
});

test('main dry-run: runs reviewers twice with dryRun:true and exits 0', async () => {
  const { deps, calls } = makeDeps();
  const code = await main({ ...BASE_OPTS, dryRun: true }, deps);
  assert.equal(code, 0);

  const reviewerCalls = calls.filter((c) => c.name === 'runReviewer');
  assert.equal(reviewerCalls.length, 2);
  for (const c of reviewerCalls) {
    const opts = c.args[0] as { dryRun: boolean };
    assert.equal(opts.dryRun, true);
  }

  const runWrites = calls.filter((c) => c.name === 'writeAgentRun');
  assert.equal(runWrites.length, 2);
  for (const c of runWrites) {
    const params = c.args[0] as { trigger: string; dryRun: boolean };
    // Dry-runs use 'manual' trigger (matches agent_runs_v2 CHECK constraint);
    // the dryRun flag distinguishes them from real manual runs via metadata.
    assert.equal(params.trigger, 'manual');
    assert.equal(params.dryRun, true);
  }

  // State + activity written
  assert.equal(calls.filter((c) => c.name === 'upsertAgentState').length, 2);
  assert.equal(calls.filter((c) => c.name === 'logAgentActivity').length, 2);
});

test('main happy path: trigger is orchestrator and exit 0', async () => {
  const { deps, calls } = makeDeps();
  const code = await main(BASE_OPTS, deps);
  assert.equal(code, 0);
  const runWrites = calls.filter((c) => c.name === 'writeAgentRun');
  assert.equal(runWrites.length, 2);
  for (const c of runWrites) {
    const params = c.args[0] as { trigger: string };
    assert.equal(params.trigger, 'orchestrator');
  }
});

test('main: one reviewer fails, other still runs, exit code 1', async () => {
  let n = 0;
  const { deps, calls } = makeDeps({
    runReviewer: async (opts) => {
      n += 1;
      calls0: {
        // no-op label just to keep the shape; capture happens below
      }
      if (n === 1) {
        throw new Error('reviewer boom');
      }
      return {
        findingsCount: 1,
        usage: FAKE_USAGE,
        sessionId: 'sesn_ok',
      };
    },
  });

  const code = await main(BASE_OPTS, deps);
  assert.equal(code, 1);

  // Second reviewer's writes should still happen
  const runWrites = calls.filter((c) => c.name === 'writeAgentRun');
  assert.equal(runWrites.length, 1);

  // Error was logged
  const errs = calls.filter((c) => c.name === 'log.error');
  assert.ok(errs.length >= 1);
});

test('main: budget guardrail blocks when estimate exceeds cap and not --force', async () => {
  const { deps, calls } = makeDeps({
    estimateSpend: async () => 999,
  });
  const code = await main(BASE_OPTS, deps);
  assert.equal(code, 1);
  // runReviewer must not have been called
  assert.equal(calls.filter((c) => c.name === 'runReviewer').length, 0);
  assert.equal(calls.filter((c) => c.name === 'writeAgentRun').length, 0);
});

test('main: --force bypasses budget guardrail', async () => {
  const { deps, calls } = makeDeps({
    estimateSpend: async () => 999,
  });
  const code = await main({ ...BASE_OPTS, force: true }, deps);
  assert.equal(code, 0);
  assert.equal(calls.filter((c) => c.name === 'runReviewer').length, 2);
});

test('main: --with-workers stub logs but does not dispatch workers', async () => {
  const { deps, calls } = makeDeps();
  const code = await main({ ...BASE_OPTS, withWorkers: true }, deps);
  assert.equal(code, 0);
  // No worker dispatch exists; just verify a stub log mentions workers
  const logs = calls.filter((c) => c.name === 'log.info');
  const hasWorkerNote = logs.some((c) =>
    (c.args[0] as string)?.toLowerCase().includes('worker'),
  );
  assert.ok(hasWorkerNote, 'should log a note about workers being skipped/stubbed');
});

test('main: reviewer receives resolved repo URL and minted token', async () => {
  const { deps, calls } = makeDeps();
  await main(BASE_OPTS, deps);
  const reviewerCall = calls.find((c) => c.name === 'runReviewer');
  assert.ok(reviewerCall);
  const opts = reviewerCall.args[0] as {
    projectRepoUrl: string;
    authToken: string;
  };
  assert.equal(
    opts.projectRepoUrl,
    'https://github.com/clayparrish-cyber/sidelineiq',
  );
  assert.equal(opts.authToken, 'ghs_faketoken');
});

test('main: empty roster exits 0 without calling reviewer', async () => {
  const { deps, calls } = makeDeps({
    runOrchestrator: async () =>
      ({ roster: [], skipped: [], signals_summary: '' } satisfies Roster),
  });
  const code = await main(BASE_OPTS, deps);
  assert.equal(code, 0);
  assert.equal(calls.filter((c) => c.name === 'runReviewer').length, 0);
});

test('main: duplicate (agent_id, project) roster entries abort with exit 1', async () => {
  // Invariant enforcement from CC 97e958e6: parallel upsertAgentState
  // for the same (agent, project) pair races on the rolling
  // run_summaries window. Duplicate roster entries must be rejected.
  const dupeRoster: Roster = {
    roster: [ENTRY_A, ENTRY_A],
    skipped: [],
    signals_summary: '',
  };
  const { deps, calls } = makeDeps({
    runOrchestrator: async () => dupeRoster,
  });
  const code = await main(BASE_OPTS, deps);
  assert.equal(code, 1);
  // Must abort before any reviewer runs.
  assert.equal(calls.filter((c) => c.name === 'runReviewer').length, 0);
  assert.equal(calls.filter((c) => c.name === 'writeAgentRun').length, 0);
  // Error log must surface the invariant violation.
  const errs = calls.filter((c) => c.name === 'log.error');
  const hitInvariant = errs.some((c) =>
    (c.args[0] as string)?.includes('INVARIANT VIOLATION'),
  );
  assert.ok(hitInvariant, 'error log should flag invariant violation');
});

test('main: reviewer step failure is tagged with step=reviewer in error log', async () => {
  // CC 195620b7: per-reviewer error logs must tag which downstream
  // step failed so CI triage can tell runReviewer timeouts apart from
  // silent upsertAgentState corruption.
  const { deps, calls } = makeDeps({
    runReviewer: async () => {
      throw new Error('reviewer boom');
    },
  });
  const code = await main(BASE_OPTS, deps);
  assert.equal(code, 1);
  const errs = calls.filter((c) => c.name === 'log.error');
  const tagged = errs.some((c) =>
    (c.args[0] as string)?.includes('[step=reviewer]'),
  );
  assert.ok(tagged, 'error log must tag step=reviewer');
});

test('main: state-upsert failure is tagged with step=state-upsert', async () => {
  // Ensure a silent upsert corruption is distinguishable from a
  // reviewer timeout in the summary logs.
  const { deps, calls } = makeDeps({
    upsertAgentState: async () => {
      throw new Error('supabase upsert boom');
    },
  });
  const code = await main(BASE_OPTS, deps);
  assert.equal(code, 1);
  const errs = calls.filter((c) => c.name === 'log.error');
  const tagged = errs.some((c) =>
    (c.args[0] as string)?.includes('[step=state-upsert]'),
  );
  assert.ok(tagged, 'error log must tag step=state-upsert');
  // Summary line should break down failures by step.
  const infos = calls.filter((c) => c.name === 'log.info');
  const hasBreakdown = infos.some((c) =>
    (c.args[0] as string)?.includes('state-upsert='),
  );
  assert.ok(hasBreakdown, 'summary must include per-step failure counts');
});
