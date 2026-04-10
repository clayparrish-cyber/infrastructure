import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  writeAgentRun,
  upsertAgentState,
  logAgentActivity,
  type SupabaseWriterClient,
  type SupabaseWriterTable,
} from '../supabase-writer.js';
import type { SessionUsage } from '../types.js';

// ---------------------------------------------------------------------------
// Fake Supabase client — captures every insert/upsert payload and lets
// tests stub the select().eq().eq().single() chain result for the
// agent_state "read-current-row" step.
// ---------------------------------------------------------------------------

interface Insert {
  table: string;
  row: unknown;
}

interface Upsert {
  table: string;
  row: unknown;
  options?: { onConflict?: string };
}

interface FakeSupabaseSelectChain {
  eq: (column: string, value: unknown) => FakeSupabaseSelectChain;
  single: () => Promise<{
    data: { run_summaries?: unknown; suppressed_patterns?: unknown } | null;
    error: null;
  }>;
}

interface FakeSupabaseClient extends SupabaseWriterClient {
  inserts: Insert[];
  upserts: Upsert[];
  /** Map of table → canned response for select().eq().eq().single(). */
  stateReadResponses: Record<
    string,
    { run_summaries?: unknown; suppressed_patterns?: unknown } | null
  >;
}

function makeFakeClient(
  stateReadResponses: Record<
    string,
    { run_summaries?: unknown; suppressed_patterns?: unknown } | null
  > = {},
): FakeSupabaseClient {
  const inserts: Insert[] = [];
  const upserts: Upsert[] = [];
  const client: FakeSupabaseClient = {
    inserts,
    upserts,
    stateReadResponses,
    from: (table: string): SupabaseWriterTable => ({
      insert: async (row) => {
        inserts.push({ table, row });
        return { error: null };
      },
      upsert: async (row, options) => {
        upserts.push({ table, row, options });
        return { error: null };
      },
      select: (_columns: string) => {
        // eq() chain is accumulated but only the final single() matters.
        const chain: FakeSupabaseSelectChain = {
          eq: (_col, _val) => chain,
          single: async () => ({
            data: client.stateReadResponses[table] ?? null,
            error: null,
          }),
        };
        return chain;
      },
    }),
  };
  return client;
}

// ---------------------------------------------------------------------------
// writeAgentRun
// ---------------------------------------------------------------------------

const SAMPLE_USAGE: SessionUsage = {
  executor_input_tokens: 20_000,
  executor_output_tokens: 3_000,
  advisor_input_tokens: 1_000,
  advisor_output_tokens: 500,
  cache_read_tokens: 0,
  cache_creation_tokens: 0,
  total_cost_usd: 0.0375,
  duration_ms: 12_345,
};

test('writeAgentRun inserts a row with the expected shape into agent_runs_v2', async () => {
  const supabase = makeFakeClient();
  await writeAgentRun({
    agentId: 'security-review',
    project: 'sidelineiq',
    usage: SAMPLE_USAGE,
    findingsCount: 3,
    trigger: 'orchestrator',
    durationMs: 12_345,
    supabase,
  });

  assert.equal(supabase.inserts.length, 1);
  const { table, row } = supabase.inserts[0]!;
  assert.equal(table, 'agent_runs_v2');

  const typed = row as {
    agent_id: string;
    project: string;
    trigger: string;
    status: string;
    findings_count: number;
    tokens_used: number;
    cost_estimate: number;
    metadata: Record<string, unknown>;
  };

  assert.equal(typed.agent_id, 'security-review');
  assert.equal(typed.project, 'sidelineiq');
  assert.equal(typed.trigger, 'orchestrator');
  assert.equal(typed.status, 'completed');
  assert.equal(typed.findings_count, 3);
  // 20000 + 3000 + 1000 + 500 = 24500
  assert.equal(typed.tokens_used, 24_500);
  assert.equal(typed.cost_estimate, 0.0375);

  assert.equal(typed.metadata.model, 'haiku+advisor');
  assert.equal(typed.metadata.tokens_input, 20_000);
  assert.equal(typed.metadata.tokens_output, 3_000);
  assert.equal(typed.metadata.advisor_input_tokens, 1_000);
  assert.equal(typed.metadata.advisor_output_tokens, 500);
  assert.equal(typed.metadata.duration_ms, 12_345);
});

test('writeAgentRun accepts a custom model name in metadata', async () => {
  const supabase = makeFakeClient();
  await writeAgentRun({
    agentId: 'orchestrator',
    project: 'infrastructure',
    usage: SAMPLE_USAGE,
    findingsCount: 0,
    trigger: 'orchestrator',
    durationMs: 9_999,
    model: 'opus-solo',
    supabase,
  });
  const row = supabase.inserts[0]!.row as { metadata: { model: string } };
  assert.equal(row.metadata.model, 'opus-solo');
});

test('writeAgentRun surfaces Supabase errors', async () => {
  const erroring: SupabaseWriterClient = {
    from: () => ({
      insert: async () => ({ error: { message: 'permission denied', code: '42501' } }),
      upsert: async () => ({ error: null }),
      select: () => ({
        eq: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) } as never),
        single: async () => ({ data: null, error: null }),
      } as never),
    }),
  };
  await assert.rejects(
    () =>
      writeAgentRun({
        agentId: 'x',
        project: 'y',
        usage: SAMPLE_USAGE,
        findingsCount: 0,
        trigger: 'manual',
        durationMs: 1,
        supabase: erroring,
      }),
    /permission denied/,
  );
});

// ---------------------------------------------------------------------------
// upsertAgentState
// ---------------------------------------------------------------------------

test('upsertAgentState rolls forward run_summaries to a max of 5', async () => {
  const prevSummaries = [
    { date: '2026-04-04', findings_count: 1, key_findings: ['A'], summary: 'S1' },
    { date: '2026-04-05', findings_count: 2, key_findings: ['B'], summary: 'S2' },
    { date: '2026-04-06', findings_count: 0, key_findings: [], summary: 'S3' },
    { date: '2026-04-07', findings_count: 4, key_findings: ['C'], summary: 'S4' },
    { date: '2026-04-08', findings_count: 3, key_findings: ['D'], summary: 'S5' },
  ];
  const supabase = makeFakeClient({
    agent_state: { run_summaries: prevSummaries, suppressed_patterns: ['sql_injection_false_positive'] },
  });

  await upsertAgentState({
    agentId: 'security-review',
    project: 'sidelineiq',
    date: '2026-04-09',
    runSummary: {
      findings_count: 2,
      key_findings: ['E1', 'E2'],
      summary: 'Two new issues',
    },
    activeFindingIds: ['wi_1', 'wi_2'],
    supabase,
  });

  assert.equal(supabase.upserts.length, 1);
  const { table, row, options } = supabase.upserts[0]!;
  assert.equal(table, 'agent_state');
  assert.equal(options?.onConflict, 'agent_id,project');

  const typed = row as {
    agent_id: string;
    project: string;
    run_summaries: Array<{ date: string; findings_count: number }>;
    active_findings: string[];
    suppressed_patterns: string[];
    updated_at: string;
  };

  // 5 previous + 1 new, sliced to last 5 → the 2026-04-04 entry is dropped.
  assert.equal(typed.run_summaries.length, 5);
  assert.equal(typed.run_summaries[0]?.date, '2026-04-05');
  assert.equal(typed.run_summaries[4]?.date, '2026-04-09');
  assert.equal(typed.run_summaries[4]?.findings_count, 2);

  assert.deepEqual(typed.active_findings, ['wi_1', 'wi_2']);
  assert.deepEqual(typed.suppressed_patterns, ['sql_injection_false_positive']);
  assert.equal(typed.agent_id, 'security-review');
  assert.equal(typed.project, 'sidelineiq');
  assert.ok(typed.updated_at);
});

test('upsertAgentState initializes run_summaries when no prior row exists', async () => {
  const supabase = makeFakeClient({ agent_state: null });

  await upsertAgentState({
    agentId: 'bug-hunt',
    project: 'dosie',
    date: '2026-04-09',
    runSummary: {
      findings_count: 1,
      key_findings: ['Unhandled promise'],
      summary: 'One issue',
    },
    activeFindingIds: ['wi_new_1'],
    supabase,
  });

  const row = supabase.upserts[0]!.row as {
    run_summaries: Array<unknown>;
    suppressed_patterns: string[];
  };
  assert.equal(row.run_summaries.length, 1);
  assert.deepEqual(row.suppressed_patterns, []);
});

test('upsertAgentState preserves existing suppressed_patterns unchanged', async () => {
  const supabase = makeFakeClient({
    agent_state: {
      run_summaries: [],
      suppressed_patterns: ['pattern_a', 'pattern_b'],
    },
  });

  await upsertAgentState({
    agentId: 'a',
    project: 'b',
    date: '2026-04-09',
    runSummary: { findings_count: 0, key_findings: [], summary: '' },
    activeFindingIds: [],
    supabase,
  });

  const row = supabase.upserts[0]!.row as { suppressed_patterns: string[] };
  assert.deepEqual(row.suppressed_patterns, ['pattern_a', 'pattern_b']);
});

// ---------------------------------------------------------------------------
// logAgentActivity
// ---------------------------------------------------------------------------

test('logAgentActivity inserts the exact shape into agent_activity', async () => {
  const supabase = makeFakeClient();
  await logAgentActivity({
    agentId: 'content-writer',
    project: 'gt-shopify',
    action: 'report_synced',
    details: { findings_count: 2, source: 'managed-reviewer' },
    supabase,
  });

  assert.equal(supabase.inserts.length, 1);
  const { table, row } = supabase.inserts[0]!;
  assert.equal(table, 'agent_activity');
  assert.deepEqual(row, {
    agent_id: 'content-writer',
    project: 'gt-shopify',
    action: 'report_synced',
    details: { findings_count: 2, source: 'managed-reviewer' },
  });
});
