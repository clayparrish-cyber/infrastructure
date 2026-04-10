#!/usr/bin/env npx tsx

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const ENV_FILE = path.join(process.env.HOME || '', '.claude', '.env');
const ACTIVE_STATUSES = ['discovered', 'triaged', 'approved', 'assigned', 'in_progress', 'review'];
const OPERATING_MODE_TYPE = 'insight';
const OPERATING_MODE_SUBJECT = 'project-operating-mode';

type WorkItemRow = {
  id: string;
  created_at: string;
  description: string | null;
  metadata: unknown;
  parent_id: string | null;
  priority: string | null;
  status: string;
  title: string;
  type: string;
  updated_at: string;
};

type OperatingModeRow = {
  content: unknown;
  created_at: string;
};

type OperatingModeRecord = {
  mode: string;
  prioritySummary: string;
  rationale: string;
  doMoreOf: string[];
  avoid: string[];
  successSignals: string[];
  reviewBy: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};

  try {
    const content = fs.readFileSync(ENV_FILE, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex <= 0) continue;

      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
  } catch {
    return env;
  }

  return env;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function firstSentence(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;

  const match = normalized.match(/^(.*?[.!?])(\s|$)/);
  return (match ? match[1] : normalized).trim();
}

function extractPurpose(row: WorkItemRow): string | null {
  const metadata = toRecord(row.metadata);
  const brief = toRecord(metadata.project_brief);
  if (typeof brief.purpose === 'string' && brief.purpose.trim()) {
    return brief.purpose.trim();
  }

  const description = row.description || '';
  const match = description.match(/Purpose:\s*(.+)/i);
  if (match?.[1]) return match[1].trim();

  return firstSentence(description);
}

function extractStageGate(row: WorkItemRow): string | null {
  const metadata = toRecord(row.metadata);
  return typeof metadata.stage_gate === 'string' && metadata.stage_gate.trim()
    ? metadata.stage_gate.trim()
    : null;
}

function extractTeam(row: WorkItemRow): string | null {
  const metadata = toRecord(row.metadata);
  return typeof metadata.team === 'string' && metadata.team.trim()
    ? metadata.team.trim()
    : null;
}

function priorityRank(priority: string | null): number {
  if (priority === 'critical') return 4;
  if (priority === 'high') return 3;
  if (priority === 'medium') return 2;
  if (priority === 'low') return 1;
  return 0;
}

function statusRank(status: string): number {
  if (status === 'approved') return 0;
  if (status === 'triaged') return 1;
  if (status === 'discovered') return 2;
  if (status === 'in_progress') return 3;
  if (status === 'review') return 4;
  if (status === 'assigned') return 5;
  return 6;
}

function titleIncludes(text: string, patterns: string[]): boolean {
  const lower = text.toLowerCase();
  return patterns.some((pattern) => lower.includes(pattern));
}

function parseOperatingModeRecord(row: OperatingModeRow | null): OperatingModeRecord | null {
  if (!row) return null;

  const content = toRecord(row.content);
  const mode = typeof content.mode === 'string' ? content.mode.trim() : '';
  const prioritySummary = typeof content.priority_summary === 'string'
    ? content.priority_summary.trim()
    : '';
  const rationale = typeof content.rationale === 'string'
    ? content.rationale.trim()
    : '';

  if (!mode || !prioritySummary || !rationale) return null;

  return {
    mode,
    prioritySummary,
    rationale,
    doMoreOf: toStringArray(content.do_more_of),
    avoid: toStringArray(content.avoid),
    successSignals: toStringArray(content.success_signals),
    reviewBy: typeof content.review_by === 'string' ? content.review_by : null,
    updatedAt: typeof content.updated_at === 'string' ? content.updated_at : row.created_at,
    updatedBy: typeof content.updated_by === 'string' ? content.updated_by : null,
  };
}

function formatModeLabel(mode: string): string {
  return `${mode.charAt(0).toUpperCase()}${mode.slice(1)} mode`;
}

function inferOperatingMode(row: WorkItemRow): string {
  const haystack = `${row.title} ${row.description || ''}`.toLowerCase();
  const stageGate = extractStageGate(row);

  if (titleIncludes(haystack, ['launch', 'prelaunch', 'testflight', 'submission', 'app review', 'store'])) {
    return 'Launch mode';
  }
  if (titleIncludes(haystack, ['harden', 'hardening', 'security', 'stability', 'stabilize', 'migration', 'rls'])) {
    return 'Hardening mode';
  }
  if (titleIncludes(haystack, ['growth', 'monetization', 'creative', 'distribution', 'ltv', 'cac'])) {
    return 'Growth mode';
  }
  if (titleIncludes(haystack, ['pilot', 'sales', 'support', 'ops'])) {
    return 'Execution mode';
  }

  if (stageGate === 'foundation') return 'Foundation mode';
  if (stageGate === 'activation') return 'Activation mode';
  if (stageGate === 'monetization') return 'Monetization mode';
  if (stageGate === 'distribution') return 'Distribution mode';
  if (stageGate === 'scale') return 'Scale mode';
  return 'Execution mode';
}

function formatPriority(priority: string | null): string {
  return (priority || 'medium').toUpperCase();
}

function formatBlocker(item: WorkItemRow): string {
  const note = firstSentence(item.description);
  const suffix = note ? ` — ${note}` : '';
  return `- [${formatPriority(item.priority)}][${item.status}] ${item.title}${suffix}`;
}

function getAgentGuardrail(agentId: string): string {
  switch (agentId) {
    case 'security-review':
      return 'Only escalate security or privacy issues that materially threaten the current release path, data safety, or trust boundary.';
    case 'ux-layout-review':
      return 'Prioritize UX friction that hurts activation, conversion, or critical task completion in the current mode.';
    case 'bug-hunt-review':
      return 'Bias toward reproducible defects that block the current initiative, not speculative cleanup.';
    case 'content-value-review':
      return 'Favor content or product-value feedback that strengthens acquisition, activation, or monetization for the active focus.';
    case 'polish-brand-review':
      return 'Do not prioritize cosmetic polish over launch blockers, conversion problems, or reliability risks.';
    case 'weekly-cleanup':
      return 'Bias toward stale blockers, missing ownership, or workflow gaps that threaten execution continuity this week.';
    default:
      return 'Stay inside the current initiative and avoid broad strategy drift.';
  }
}

/**
 * Returns the rendered "Current Business Priorities" markdown section for
 * the given project + agent, or empty string if there is nothing to render.
 * Safe to call from both the CLI shim below and from other TS modules
 * (e.g. managed/prompt-builder.ts).
 */
export async function render(project: string, agentId: string): Promise<string> {
  if (!project || !agentId) return '';

  const fileEnv = loadEnv();
  const url = process.env.SUPABASE_URL || fileEnv.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return '';

  const supabase = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const [initiativeResp, blockerResp, operatingModeResp] = await Promise.all([
    supabase
      .from('work_items')
      .select('id, created_at, description, metadata, parent_id, priority, status, title, type, updated_at')
      .eq('project', project)
      .eq('type', 'initiative')
      .in('status', ACTIVE_STATUSES)
      .order('updated_at', { ascending: false })
      .limit(10),
    supabase
      .from('work_items')
      .select('id, created_at, description, metadata, parent_id, priority, status, title, type, updated_at')
      .eq('project', project)
      .neq('type', 'initiative')
      .in('status', ACTIVE_STATUSES)
      .order('updated_at', { ascending: false })
      .limit(100),
    supabase
      .from('knowledge')
      .select('content, created_at')
      .eq('type', OPERATING_MODE_TYPE)
      .eq('subject', OPERATING_MODE_SUBJECT)
      .eq('project', project)
      .is('superseded_by', null)
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  const blockerRows = (blockerResp.data || []) as WorkItemRow[];
  const childCountByParent = new Map<string, number>();
  for (const blocker of blockerRows) {
    if (!blocker.parent_id) continue;
    childCountByParent.set(blocker.parent_id, (childCountByParent.get(blocker.parent_id) || 0) + 1);
  }

  const initiatives = ((initiativeResp.data || []) as WorkItemRow[]).sort((a, b) => {
    const childCountDiff = (childCountByParent.get(b.id) || 0) - (childCountByParent.get(a.id) || 0);
    if (childCountDiff !== 0) return childCountDiff;

    const priorityDiff = priorityRank(b.priority) - priorityRank(a.priority);
    if (priorityDiff !== 0) return priorityDiff;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  const blockers = blockerRows
    .sort((a, b) => {
      const priorityDiff = priorityRank(b.priority) - priorityRank(a.priority);
      if (priorityDiff !== 0) return priorityDiff;

      const statusDiff = statusRank(a.status) - statusRank(b.status);
      if (statusDiff !== 0) return statusDiff;

      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    })
    .slice(0, 5);

  const explicitMode = parseOperatingModeRecord(((operatingModeResp.data || [])[0] as OperatingModeRow | undefined) || null);
  if (!explicitMode && initiatives.length === 0 && blockers.length === 0) {
    return '';
  }

  const focus = initiatives[0] || null;
  const focusBlockers = focus
    ? blockers.filter((blocker) => blocker.parent_id === focus.id)
    : [];
  const visibleBlockers = (focusBlockers.length > 0 ? focusBlockers : blockers).slice(0, 5);
  const lines = ['## Current Business Priorities — Optimize For This Work Now', ''];

  if (focus) {
    const purpose = extractPurpose(focus);
    const team = extractTeam(focus);
    const stageGate = extractStageGate(focus);

    lines.push(`Operating mode: ${explicitMode ? formatModeLabel(explicitMode.mode) : inferOperatingMode(focus)}`);
    if (explicitMode) {
      lines.push(`Priority window: ${explicitMode.prioritySummary}`);
      lines.push(`Why now: ${explicitMode.rationale}`);
    }
    lines.push(`Primary initiative: ${focus.title}`);
    lines.push(`Project priority: ${formatPriority(focus.priority)}`);
    if (stageGate) lines.push(`Stage gate: ${stageGate}`);
    if (team) lines.push(`Owning team: ${team}`);
    if (purpose) lines.push(`Focus: ${purpose}`);
  } else if (explicitMode) {
    lines.push(`Operating mode: ${formatModeLabel(explicitMode.mode)}`);
    lines.push(`Priority window: ${explicitMode.prioritySummary}`);
    lines.push(`Why now: ${explicitMode.rationale}`);
  }

  if (explicitMode) {
    if (explicitMode.doMoreOf.length > 0) {
      lines.push('');
      lines.push('Optimize for:');
      for (const item of explicitMode.doMoreOf.slice(0, 4)) {
        lines.push(`- ${item}`);
      }
    }

    if (explicitMode.avoid.length > 0) {
      lines.push('');
      lines.push('Avoid:');
      for (const item of explicitMode.avoid.slice(0, 4)) {
        lines.push(`- ${item}`);
      }
    }

    if (explicitMode.successSignals.length > 0) {
      lines.push('');
      lines.push('Success looks like:');
      for (const item of explicitMode.successSignals.slice(0, 4)) {
        lines.push(`- ${item}`);
      }
    }
  }

  if (visibleBlockers.length > 0) {
    lines.push('');
    lines.push('Highest-priority open work:');
    for (const blocker of visibleBlockers) {
      lines.push(formatBlocker(blocker));
    }
  }

  lines.push('');
  lines.push('Guardrails:');
  lines.push('- Tie findings and proposed changes back to the current initiative or listed blockers.');
  lines.push('- If something is valid but not useful right now, lower its priority or leave it out.');
  lines.push(`- ${getAgentGuardrail(agentId)}`);
  if (explicitMode?.reviewBy) {
    lines.push(`- Review this operating mode again by ${explicitMode.reviewBy}.`);
  }

  return `${lines.join('\n')}\n`;
}

// CLI shim — preserves the original stdout-streaming behavior used by
// `nightly-review.yml` via `npx tsx ... 2>/dev/null || echo ""`.
const isCli =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`;

if (isCli) {
  const [project, agentId] = process.argv.slice(2);
  render(project || '', agentId || '')
    .then((out) => {
      if (out) process.stdout.write(out);
      process.exit(0);
    })
    .catch(() => {
      process.exit(0);
    });
}
