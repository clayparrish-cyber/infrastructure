/**
 * Shared type definitions for the managed-agents migration.
 *
 * These types describe the payloads exchanged between the orchestrator,
 * reviewer, and worker stages of the nightly code-review pipeline as it
 * moves from `claude -p` to Anthropic's Managed Agents API.
 *
 * ReviewerFinding matches the shape the existing pipeline already produces
 * and consumes in `sync-to-supabase.ts`.
 */

// ---------------------------------------------------------------------------
// Orchestrator — roster selection
// ---------------------------------------------------------------------------

export type RosterPriority = 'high' | 'medium' | 'low';

export interface RosterEntry {
  agent_id: string;
  project: string;
  priority: RosterPriority;
  reason: string;
}

export interface RosterSkip {
  agent_id: string;
  project: string;
  reason: string;
}

export interface Roster {
  roster: RosterEntry[];
  skipped: RosterSkip[];
  signals_summary: string;
}

// ---------------------------------------------------------------------------
// Reviewer — findings
// ---------------------------------------------------------------------------

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * Matches the shape produced by existing reviewer agents and consumed by
 * `sync-to-supabase.ts` (lines 548-646). Optional fields reflect agents
 * that don't always populate every attribute.
 */
export interface ReviewerFinding {
  id: string;
  title: string;
  description: string;
  severity: FindingSeverity;
  plainEnglish?: string;
  files?: string[];
  suggestedFix?: string;
  effort?: string;
  decision_category?: string;
}

// ---------------------------------------------------------------------------
// Usage accounting — shared by reviewer and worker
// ---------------------------------------------------------------------------

export interface SessionUsage {
  executor_input_tokens: number;
  executor_output_tokens: number;
  advisor_input_tokens: number;
  advisor_output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  total_cost_usd: number;
  duration_ms: number;
}

// ---------------------------------------------------------------------------
// Reviewer result envelope
// ---------------------------------------------------------------------------

export interface ReviewResult {
  findings: ReviewerFinding[];
  usage: SessionUsage;
  session_id: string;
  agent_id: string;
  project: string;
}

// ---------------------------------------------------------------------------
// Worker result envelope — discriminated union so consumers don't need to
// null-check branch/pr_url when status is 'done'.
// ---------------------------------------------------------------------------

export type WorkerStatus = 'done' | 'human-action' | 'already-resolved';

export type WorkerResult =
  | {
      status: 'done';
      branch: string;
      pr_url: string;
      session_id: string;
    }
  | {
      status: 'human-action' | 'already-resolved';
      branch: null;
      pr_url: null;
      session_id: string;
    };
