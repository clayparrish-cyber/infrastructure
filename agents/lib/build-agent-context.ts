#!/usr/bin/env npx tsx
/**
 * Build Agent Context — generates a markdown context block for an agent run.
 *
 * Queries:
 * - agent_state (prior run summaries, active findings, suppressed patterns)
 * - work_items (open findings from this agent on this project)
 * - knowledge (relevant knowledge entries)
 * - decision_log (acceptance-rate feedback for this agent)
 *
 * Usage: npx tsx build-agent-context.ts <project> <agent_id>
 * Output: markdown string to stdout
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

function resolveDecisionAgentId(row: any): string | null {
  if (typeof row?.agent_function === 'string' && row.agent_function.trim()) {
    return row.agent_function.trim();
  }

  const workItem = row?.work_item;
  if (workItem && typeof workItem === 'object' && !Array.isArray(workItem) && typeof workItem.source_id === 'string' && workItem.source_id.trim()) {
    return workItem.source_id.trim();
  }

  if (Array.isArray(workItem)) {
    const first = workItem.find((entry: any) => typeof entry?.source_id === 'string' && entry.source_id.trim());
    if (first?.source_id) {
      return first.source_id.trim();
    }
  }

  return null;
}

const envPath = path.join(process.env.HOME || '', '.claude', '.env');
const env: Record<string, string> = {};
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let value = trimmed.slice(eqIdx + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        env[key] = value;
      }
    }
  }
}

const supabaseUrl = process.env.SUPABASE_URL || env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  process.exit(0); // Silent exit — context is optional
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const [project, agentId] = process.argv.slice(2);
  if (!project || !agentId) {
    process.exit(0);
  }

  const sections: string[] = [];

  // 1. Agent state (prior run context)
  try {
    const { data: state } = await supabase
      .from('agent_state')
      .select('run_summaries, active_findings, suppressed_patterns')
      .eq('agent_id', agentId)
      .eq('project', project)
      .single();

    if (state) {
      const summaries = (state.run_summaries as any[]) || [];
      if (summaries.length > 0) {
        sections.push('## Prior Run History\n');
        for (const run of summaries.slice(-5)) {
          sections.push(`- **${run.date}**: ${run.findings_count} findings. ${run.summary || ''}`);
          if (run.key_findings?.length) {
            for (const kf of run.key_findings.slice(0, 3)) {
              sections.push(`  - ${kf}`);
            }
          }
        }
        sections.push('');
      }

      const suppressed = (state.suppressed_patterns as string[]) || [];
      if (suppressed.length > 0) {
        sections.push('## Suppressed Patterns (do NOT re-report these)\n');
        sections.push('The following finding patterns were previously rejected by the human reviewer. Do not report similar findings:\n');
        for (const pattern of suppressed) {
          sections.push(`- ${pattern}`);
        }
        sections.push('');
      }
    }
  } catch {
    // Silent — agent_state may not exist yet
  }

  // 2. Open work items from this agent on this project
  try {
    const { data: openItems } = await supabase
      .from('work_items')
      .select('title, status, priority, created_at')
      .eq('project', project)
      .eq('source_id', agentId)
      .in('status', ['discovered', 'triaged', 'approved', 'in_progress', 'review'])
      .order('created_at', { ascending: false })
      .limit(10);

    if (openItems && openItems.length > 0) {
      sections.push('## Your Open Findings (still pending action)\n');
      sections.push('These are findings you previously reported that are still open. Avoid duplicating them:\n');
      for (const item of openItems) {
        sections.push(`- [${item.status}] (${item.priority}) ${item.title}`);
      }
      sections.push('');
    }
  } catch {
    // Silent
  }

  // 3. Relevant knowledge entries
  try {
    const { data: knowledge } = await supabase
      .from('knowledge')
      .select('subject, content, confidence')
      .or(`subject.ilike.%${project}%,subject.ilike.%${agentId}%`)
      .order('created_at', { ascending: false })
      .limit(5);

    if (knowledge && knowledge.length > 0) {
      sections.push('## Organizational Knowledge\n');
      for (const k of knowledge) {
        const conf = k.confidence ? ` (confidence: ${(k.confidence * 100).toFixed(0)}%)` : '';
        sections.push(`- **${k.subject}**${conf}: ${typeof k.content === 'string' ? k.content.slice(0, 200) : JSON.stringify(k.content).slice(0, 200)}`);
      }
      sections.push('');
    }
  } catch {
    // Silent
  }

  // 4. Acceptance-rate self-awareness (last 30 days)
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: decisions } = await supabase
      .from('decision_log')
      .select('decision, agent_function, work_item:work_item_id(source_id)')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(500);

    const ownDecisions = (decisions || []).filter((row: any) => resolveDecisionAgentId(row) === agentId);

    if (ownDecisions.length >= 3) {
      const approvals = ownDecisions.filter((row: any) => row.decision === 'approved' || row.decision === 'acknowledged').length;
      const rejections = ownDecisions.filter((row: any) => row.decision === 'rejected').length;
      const deferrals = ownDecisions.filter((row: any) => row.decision === 'deferred').length;
      const approvalRate = approvals / ownDecisions.length;

      sections.push('## Your Performance\n');
      sections.push(`- Approval rate (30 days): ${(approvalRate * 100).toFixed(0)}% (${approvals}/${ownDecisions.length})`);
      sections.push(`- Rejections: ${rejections}`);
      if (deferrals > 0) {
        sections.push(`- Deferrals: ${deferrals}`);
      }
      if (approvalRate < 0.5) {
        sections.push('- Warning: Your recent acceptance rate is below 50%. Raise the bar and focus on higher-confidence findings.');
      }
      sections.push('');
    }
  } catch {
    // Silent
  }

  if (sections.length > 0) {
    console.log('# Agent Memory Context\n');
    console.log(sections.join('\n'));
  }
}

main().catch(() => process.exit(0));
