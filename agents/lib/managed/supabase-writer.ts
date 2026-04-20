/**
 * Direct Supabase writes for the managed-agents nightly pipeline.
 *
 * Three functions, each matching the shape that sync-to-supabase.ts has
 * been writing since the GH-Actions pipeline shipped:
 *
 *   writeAgentRun     → INSERT into agent_runs_v2
 *   upsertAgentState  → UPSERT into agent_state (rolling 5 run_summaries,
 *                        replaces active_findings, preserves
 *                        suppressed_patterns)
 *   logAgentActivity  → INSERT into agent_activity (legacy table)
 *
 * Reference shapes: agents/lib/sync-to-supabase.ts:735 (agent_activity),
 * :758-775 (agent_runs_v2), :781-822 (agent_state). Behavior parity
 * with the bash pipeline is the requirement; we do NOT invent new
 * columns. When sync-to-supabase.ts is eventually deleted, these are
 * the functions that replace its write paths from inside the managed
 * pipeline.
 *
 * Client injection: every function takes an optional `supabase` arg so
 * tests can pass a fake client that captures insert/upsert payloads.
 * Production calls omit the arg and fall through to getSupabase() from
 * ./sdk.ts.
 */

import { getSupabase } from './sdk.js';
import type { SessionUsage } from './types.js';

// ---------------------------------------------------------------------------
// Minimal client shape — the three Supabase methods we actually call.
// A real SupabaseClient matches this structurally; hand-rolled fakes in
// tests can expose the same shape without pulling in the full SDK.
// ---------------------------------------------------------------------------

export interface SupabaseWriterClient {
  from: (table: string) => SupabaseWriterTable;
}

export interface SupabaseWriterTable {
  insert: (row: unknown) => Promise<{ error: SupabaseError | null }>;
  upsert: (
    row: unknown,
    options?: { onConflict?: string },
  ) => Promise<{ error: SupabaseError | null }>;
  select: (columns: string) => SupabaseWriterSelectChain;
}

/**
 * Row shape returned by the agent_runs_v2 .gte('started_at', ...) path.
 * Kept narrow so estimateSpend in run-nightly.ts doesn't need an `any`
 * escape to drive the real Supabase client's method chain. If future
 * callers need additional columns, extend this row or add a sibling
 * typed row interface per table rather than widening back to `any`.
 */
export interface AgentRunHistoryRow {
  agent_id: string;
  project: string;
  cost_estimate: number | null;
}

export interface SupabaseWriterSelectChain {
  eq: (column: string, value: unknown) => SupabaseWriterSelectChain;
  /**
   * Optional `.gte()` terminal — resolves to a Supabase-shaped result.
   * Typed as optional because the two write helpers in this module
   * don't call it; only estimateSpend in run-nightly.ts does. Marking
   * it optional lets hand-rolled test fakes for the write paths skip
   * implementing it.
   */
  gte?: (
    column: string,
    value: string,
  ) => Promise<{
    data: AgentRunHistoryRow[] | null;
    error: SupabaseError | null;
  }>;
  single: () => Promise<{
    data: { run_summaries?: unknown; suppressed_patterns?: unknown } | null;
    error: SupabaseError | null;
  }>;
}

export interface SupabaseError {
  message: string;
  code?: string;
}

// ---------------------------------------------------------------------------
// writeAgentRun — agent_runs_v2 insert
// ---------------------------------------------------------------------------

export interface WriteAgentRunParams {
  agentId: string;
  project: string;
  usage: SessionUsage;
  findingsCount: number;
  /**
   * Must match a value in the agent_runs_v2_trigger_check CHECK constraint.
   * Verified allowed values as of 2026-04-10: 'manual', 'nightly',
   * 'orchestrator', 'work_loop_manager'. Do NOT pass 'dryrun' — the
   * constraint rejects it. Use metadata.dry_run to flag dry-run runs.
   *
   * IMPORTANT (CC d368a643): `trigger` is reserved for the CHECK-
   * constrained vocabulary above. For runtime context (e.g. which cron
   * shape invoked this, whether this is a retry, etc.), use the
   * optional `source` field below — it lands in metadata.source and
   * does not need a DB migration to extend.
   */
  trigger: 'orchestrator' | 'manual' | 'nightly';
  durationMs: number;
  /** If true, sets metadata.dry_run=true so dashboard queries can filter. */
  dryRun?: boolean;
  /** Defaults to 'sonnet-4-6' (the reviewer model for the 2026-04-09
   *  cutover since advisor tool isn't supported on Managed Agents).
   *  Override to 'opus-4-6' for orchestrator runs. */
  model?: string;
  /**
   * Free-form runtime context tag written to metadata.source. Unlike
   * `trigger`, this is NOT CHECK-constrained so it can carry values
   * like 'scheduled-cron', 'workflow-dispatch', 'retry', 'worker-loop'
   * without a DB migration. Dashboard queries that want to distinguish
   * cron vs dispatch should key on metadata.source, not `trigger`.
   */
  source?: string;
  /** Override the Supabase client — tests pass a fake. */
  supabase?: SupabaseWriterClient;
}

export async function writeAgentRun(
  params: WriteAgentRunParams,
): Promise<void> {
  const supabase = params.supabase ?? (getSupabase() as unknown as SupabaseWriterClient);

  const tokensUsed =
    params.usage.executor_input_tokens +
    params.usage.executor_output_tokens +
    params.usage.advisor_input_tokens +
    params.usage.advisor_output_tokens;

  const row = {
    agent_id: params.agentId,
    project: params.project,
    trigger: params.trigger,
    status: 'completed',
    findings_count: params.findingsCount,
    tokens_used: tokensUsed,
    cost_estimate: params.usage.total_cost_usd,
    metadata: {
      model: params.model ?? 'sonnet-4-6',
      tokens_input: params.usage.executor_input_tokens,
      tokens_output: params.usage.executor_output_tokens,
      advisor_input_tokens: params.usage.advisor_input_tokens,
      advisor_output_tokens: params.usage.advisor_output_tokens,
      cache_creation_tokens: params.usage.cache_creation_tokens,
      cache_read_tokens: params.usage.cache_read_tokens,
      duration_ms: params.durationMs,
      runtime: 'managed-agents',
      ...(params.dryRun ? { dry_run: true } : {}),
      ...(params.source ? { source: params.source } : {}),
    },
  };

  const { error } = await supabase.from('agent_runs_v2').insert(row);
  if (error) {
    throw new Error(
      `Failed to insert agent_runs_v2 row for ${params.agentId}/${params.project}: ${error.message}`,
    );
  }
}

// ---------------------------------------------------------------------------
// upsertAgentState — agent_state upsert with rolling run_summaries
// ---------------------------------------------------------------------------

export interface AgentRunSummary {
  findings_count: number;
  key_findings: string[];
  summary: string;
}

export interface UpsertAgentStateParams {
  agentId: string;
  project: string;
  /** ISO date string YYYY-MM-DD — attached to the run summary so the
   *  dashboard can sort historical runs chronologically. */
  date: string;
  runSummary: AgentRunSummary;
  activeFindingIds: string[];
  supabase?: SupabaseWriterClient;
}

/**
 * Upserts agent_state for a single (agent_id, project) pair.
 *
 * Preservation rules (matching sync-to-supabase.ts:781-822 exactly):
 * - run_summaries: append new summary + slice(-5) to keep a rolling
 *   window of the last 5 runs
 * - active_findings: REPLACED by activeFindingIds (authoritative)
 * - suppressed_patterns: fetched from the existing row and written
 *   back untouched (never clobbered)
 * - updated_at: written server-side via new Date().toISOString()
 *
 * Uses Supabase's native upsert with onConflict: 'agent_id,project'.
 *
 * CONCURRENCY INVARIANT (CC 97e958e6):
 * This function is READ-MODIFY-WRITE on run_summaries and
 * suppressed_patterns. If two callers hit it in parallel for the SAME
 * (agent_id, project) pair, the later write silently clobbers the
 * earlier one and one run_summary is lost from the rolling 5-window.
 *
 * The pipeline's invariant is that the nightly roster MUST contain at
 * most ONE entry per (agent_id, project) pair — run-nightly.ts enforces
 * this at the top of its reviewer loop and throws if it sees a duplicate
 * roster entry. Any future code path that wants to dispatch multiple
 * sessions for the same (agent, project) pair MUST EITHER:
 *   (a) serialize the writes via p-limit keyed on `${agent}|${project}`,
 *   (b) replace this read-modify-write with a Postgres RPC that appends
 *       atomically (requires DB migration — see memory file
 *       feedback_subagent-prod-authority before running it), OR
 *   (c) adopt optimistic concurrency via an `updated_at` check column.
 * Prefer (a) unless the workload genuinely needs concurrency; the
 * nightly pipeline is dispatch-once-per-pair today and that shape
 * should be preserved as the default.
 */
export async function upsertAgentState(
  params: UpsertAgentStateParams,
): Promise<void> {
  const supabase =
    params.supabase ?? (getSupabase() as unknown as SupabaseWriterClient);

  // Read current row to preserve run_summaries history + suppressed_patterns.
  const { data: existing } = await supabase
    .from('agent_state')
    .select('run_summaries, suppressed_patterns')
    .eq('agent_id', params.agentId)
    .eq('project', params.project)
    .single();

  const prevSummaries = Array.isArray(existing?.run_summaries)
    ? (existing.run_summaries as Array<Record<string, unknown>>)
    : [];

  const newSummary = {
    date: params.date,
    ...params.runSummary,
  };

  // Roll forward, cap at 5.
  const newSummaries = [...prevSummaries, newSummary].slice(-5);

  const suppressedPatterns = Array.isArray(existing?.suppressed_patterns)
    ? existing.suppressed_patterns
    : [];

  const row = {
    agent_id: params.agentId,
    project: params.project,
    run_summaries: newSummaries,
    active_findings: params.activeFindingIds,
    suppressed_patterns: suppressedPatterns,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('agent_state')
    .upsert(row, { onConflict: 'agent_id,project' });

  if (error) {
    throw new Error(
      `Failed to upsert agent_state for ${params.agentId}/${params.project}: ${error.message}`,
    );
  }
}

// ---------------------------------------------------------------------------
// logAgentActivity — agent_activity insert
// ---------------------------------------------------------------------------

export interface LogAgentActivityParams {
  agentId: string;
  project: string;
  action: string;
  details: Record<string, unknown>;
  supabase?: SupabaseWriterClient;
}

export async function logAgentActivity(
  params: LogAgentActivityParams,
): Promise<void> {
  const supabase =
    params.supabase ?? (getSupabase() as unknown as SupabaseWriterClient);

  const row = {
    agent_id: params.agentId,
    project: params.project,
    action: params.action,
    details: params.details,
  };

  const { error } = await supabase.from('agent_activity').insert(row);
  if (error) {
    throw new Error(
      `Failed to insert agent_activity row for ${params.agentId}/${params.project}: ${error.message}`,
    );
  }
}
