#!/usr/bin/env npx tsx
/**
 * Sync Agent Reports to Supabase
 *
 * Reads JSON reports from ~/Projects/agent-reports/{project}/ and syncs them
 * to the Supabase tasks table. Syncs all projects from the agent registry.
 *
 * Usage:
 *   npx tsx sync-to-supabase.ts [project] [--date YYYY-MM-DD]
 *
 * Examples:
 *   npx tsx sync-to-supabase.ts sidelineiq          # Sync today's reports
 *   npx tsx sync-to-supabase.ts dosie --date 2026-02-04
 *   npx tsx sync-to-supabase.ts                     # Sync all projects from registry
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

type SupabaseClientLike = any;

const REGISTRY_PATH = process.env.REGISTRY_PATH
  || path.join(process.env.HOME || '', '.claude', 'agents', 'registry.json');
const REPORTS_DIR = process.env.REPORTS_DIR
  || path.join(process.env.HOME || '', 'Projects', 'agent-reports');

function getProjectsFromRegistry(): string[] {
  try {
    const content = fs.readFileSync(REGISTRY_PATH, 'utf-8');
    const registry = JSON.parse(content);
    return Object.keys(registry.projects || {});
  } catch (e) {
    console.error('Could not read registry:', e);
    return [];
  }
}
const ENV_FILE = path.join(process.env.HOME || '', '.claude', '.env');

// Severity to action_type mapping (old tasks table)
const SEVERITY_TO_ACTION: Record<string, string> = {
  high: 'human_task',
  medium: 'approval',
  low: 'info',
  info: 'info'
};

// Severity to priority mapping (new work_items table)
const SEVERITY_TO_PRIORITY: Record<string, string> = {
  high: 'high',
  medium: 'medium',
  low: 'low',
  info: 'low',
};

// Agent ID to category mapping for decision_category
const AGENT_CATEGORY: Record<string, string> = {
  'security-review': 'security',
  'ux-layout-review': 'ux',
  'bug-hunt-review': 'bugs',
  'content-value-review': 'content',
  'polish-brand-review': 'polish',
  'performance-review': 'performance',
  'tier2-rotating-review': 'general',
  'weekly-cleanup': 'ops',
};

// =============================================================================
// Shadow Recommender — generates system_recommendation for L2+ categories
// Mirrors dashboard/src/lib/server/shadow-recommender.ts logic
// =============================================================================

async function applyRecommendation(
  supabase: SupabaseClientLike,
  workItemId: string,
  category: string,
  project: string
): Promise<void> {
  // Delegations are auto-approved by the creating agent — skip
  if (category.startsWith('delegation-')) return;

  // Check autonomy level
  const { data: rule } = await supabase
    .from('autonomy_rules')
    .select('current_level')
    .eq('decision_category', category)
    .single();

  if (!rule || (rule.current_level || 1) < 2) return;

  // Get recent decisions for pattern matching
  const { data: recentDecisions } = await supabase
    .from('decision_log')
    .select('decision, priority, project')
    .eq('decision_category', category)
    .order('created_at', { ascending: false })
    .limit(30);

  if (!recentDecisions || recentDecisions.length < 5) return;

  // Compute outcome counts
  const approvals = recentDecisions.filter((d: any) => d.decision === 'approved').length;
  const rejections = recentDecisions.filter((d: any) => d.decision === 'rejected').length;
  const deferrals = recentDecisions.filter((d: any) => d.decision === 'deferred').length;
  const total = recentDecisions.length;

  const approvalRate = approvals / total;
  const rejectionRate = rejections / total;
  const deferralRate = deferrals / total;

  // Project-specific refinement (70% category-wide, 30% project-specific)
  const sameProject = recentDecisions.filter((d: any) => d.project === project);
  let projectApprovalRate = approvalRate;
  if (sameProject.length >= 3) {
    projectApprovalRate = sameProject.filter((d: any) => d.decision === 'approved').length / sameProject.length;
  }
  const weightedApprovalRate = 0.7 * approvalRate + 0.3 * projectApprovalRate;

  // Determine recommendation
  let recommendation: string;
  let confidence: number;

  if (weightedApprovalRate >= 0.70) {
    recommendation = 'approved';
    confidence = Math.min(0.95, 0.5 + (weightedApprovalRate - 0.5));
  } else if (rejectionRate >= 0.50) {
    recommendation = 'rejected';
    confidence = Math.min(0.90, 0.4 + rejectionRate * 0.5);
  } else if (deferralRate >= 0.40) {
    recommendation = 'deferred';
    confidence = Math.min(0.80, 0.3 + deferralRate * 0.5);
  } else {
    recommendation = 'approved';
    confidence = 0.4 + (approvalRate * 0.3);
  }

  // Boost confidence with more data
  const dataSizeBoost = Math.min(0.1, (total - 5) * 0.005);
  confidence = Math.min(0.95, Math.round((confidence + dataSizeBoost) * 100) / 100);

  // Update work item with recommendation
  const { error } = await supabase
    .from('work_items')
    .update({
      system_recommendation: recommendation,
      system_confidence: confidence,
    })
    .eq('id', workItemId);

  if (!error) {
    console.log(`      Shadow: ${recommendation} (${(confidence * 100).toFixed(0)}%)`);
  }
}

// =============================================================================
// Auto-Approve — auto-approves findings for L3+ categories
// Mirrors dashboard/src/lib/server/auto-approve.ts logic
// =============================================================================

async function maybeAutoApprove(
  supabase: SupabaseClientLike,
  workItemId: string,
  category: string
): Promise<void> {
  // Delegations are auto-approved by the creating agent — skip
  if (category.startsWith('delegation-')) return;

  const { data: rule } = await supabase
    .from('autonomy_rules')
    .select('current_level')
    .eq('decision_category', category)
    .single();

  if (!rule || (rule.current_level || 1) < 3) return;

  // Auto-approve
  const { error } = await supabase
    .from('work_items')
    .update({ status: 'approved' })
    .eq('id', workItemId);

  if (error) return;

  // Log event
  await supabase.from('work_item_events').insert({
    work_item_id: workItemId,
    event_type: 'auto_approved',
    from_status: 'discovered',
    to_status: 'approved',
    actor: 'system',
    actor_type: 'system',
    notes: `Autonomy L${rule.current_level}: auto-approved for category ${category}`,
  });

  // Update autonomy metrics
  await supabase.rpc('update_autonomy_metrics', { p_category: category });

  console.log(`      Auto-approved (L${rule.current_level})`);
}

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  try {
    const content = fs.readFileSync(ENV_FILE, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
          const key = trimmed.slice(0, eqIndex).trim();
          let value = trimmed.slice(eqIndex + 1).trim();
          if ((value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          env[key] = value;
        }
      }
    }
  } catch (e) {
    console.error('Could not read env file:', e);
  }
  return env;
}

async function syncProject(supabase: SupabaseClientLike, project: string, date: string) {
  const projectDir = path.join(REPORTS_DIR, project);

  if (!fs.existsSync(projectDir)) {
    console.log(`  Skipping ${project}: directory not found`);
    return { synced: 0, skipped: 0 };
  }

  // Find JSON reports for the given date
  const files = fs.readdirSync(projectDir).filter(f =>
    f.endsWith('.json') &&
    f.includes(date) &&
    !f.includes('_tasks-fallback') &&
    !f.includes('_activity-fallback') &&
    !f.includes('_runs-fallback') &&
    !f.includes('-usage.json')
  );

  if (files.length === 0) {
    console.log(`  No reports found for ${project} on ${date}`);
    return { synced: 0, skipped: 0 };
  }

  let synced = 0;
  let skipped = 0;

  for (const file of files) {
    const filePath = path.join(projectDir, file);
    console.log(`  Processing ${file}...`);

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const report = JSON.parse(content);

      if (!report.findings || !Array.isArray(report.findings)) {
        console.log(`    No findings array in ${file}`);
        continue;
      }

      const agentId = report.meta?.agent || file.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace('.json', '');

      // Derive agent category for decision_category
      const agentCategory = AGENT_CATEGORY[agentId] || 'general';

      for (const finding of report.findings) {
        // Check if already synced in tasks table (old)
        const { data: existing } = await supabase
          .from('tasks')
          .select('id')
          .eq('metadata->>finding_id', finding.id)
          .single();

        // Check if already synced in work_items table (new)
        const { data: existingWorkItem } = await supabase
          .from('work_items')
          .select('id')
          .eq('metadata->>finding_id', finding.id)
          .eq('project', project)
          .single();

        if (existing && existingWorkItem) {
          skipped++;
          continue;
        }

        const severity = finding.severity?.toLowerCase() || 'info';
        const description = [
          finding.description,
          finding.files?.length ? `\n\n**Files:** ${finding.files.join(', ')}` : '',
          finding.suggestedFix ? `\n\n**Suggested fix:** ${finding.suggestedFix}` : '',
          finding.effort ? `\n\n**Effort:** ${finding.effort}` : ''
        ].join('');
        const metadata = {
          finding_id: finding.id,
          severity: finding.severity,
          files: finding.files,
          effort: finding.effort,
          source_file: file,
          synced_at: new Date().toISOString()
        };

        // --- OLD: Insert into tasks table (parallel-run period) ---
        if (!existing) {
          const actionType = SEVERITY_TO_ACTION[severity] || 'info';
          const { error } = await supabase.from('tasks').insert({
            project,
            title: finding.title,
            description,
            status: 'pending',
            action_type: actionType,
            metadata,
            created_by: agentId
          });

          if (error) {
            console.log(`    Error inserting task ${finding.id}: ${error.message}`);
          }
        }

        // --- NEW: Insert into work_items table ---
        if (!existingWorkItem) {
          const priority = SEVERITY_TO_PRIORITY[severity] || 'low';
          const decisionCategory = `${agentCategory}-${severity}`;

          const { data: workItem, error: wiError } = await supabase
            .from('work_items')
            .insert({
              type: 'finding',
              project,
              title: finding.title,
              description,
              status: 'discovered',
              priority,
              source_type: 'agent',
              source_id: agentId,
              created_by: agentId,
              decision_category: decisionCategory,
              metadata
            })
            .select('id')
            .single();

          if (wiError) {
            console.log(`    Error inserting work_item ${finding.id}: ${wiError.message}`);
          } else if (workItem) {
            // Insert work_item_events for the creation
            const { error: eventError } = await supabase
              .from('work_item_events')
              .insert({
                work_item_id: workItem.id,
                event_type: 'created',
                actor: agentId,
                actor_type: 'agent',
                notes: `Synced from ${file}`
              });

            if (eventError) {
              console.log(`    Error inserting work_item_event for ${finding.id}: ${eventError.message}`);
            }

            // L2+ Shadow recommendation — records what system would decide
            try {
              await applyRecommendation(supabase, workItem.id, decisionCategory, project);
            } catch (e) {
              console.log(`      Recommendation error (non-blocking): ${e}`);
            }

            // L3+ Auto-approve — bypasses human gate
            try {
              await maybeAutoApprove(supabase, workItem.id, decisionCategory);
            } catch (e) {
              console.log(`      Auto-approve error (non-blocking): ${e}`);
            }
          }
        }

        // Count as synced if either insert succeeded (or was already present)
        if (!existing || !existingWorkItem) {
          synced++;
        }
      }

      // Process delegation requests from scout agents
      if (report.delegations && Array.isArray(report.delegations)) {
        for (const delegation of report.delegations) {
          if (!delegation.specialist || !delegation.title) continue;

          const { data: delegationItem, error: delError } = await supabase
            .from('work_items')
            .insert({
              type: 'delegation',
              project,
              title: delegation.title,
              description: delegation.description || '',
              status: 'approved', // Auto-approved — skip human gate
              priority: delegation.priority || 'medium',
              source_type: 'agent',
              source_id: agentId,
              created_by: agentId,
              assigned_to: delegation.specialist,
              decision_category: `delegation-${delegation.specialist}`,
              metadata: {
                requesting_agent: agentId,
                delegation_context: delegation.context,
                specialist: delegation.specialist,
              },
            })
            .select('id')
            .single();

          if (delegationItem) {
            console.log(`      Delegated to ${delegation.specialist}: ${delegation.title}`);
          } else if (delError) {
            console.warn(`      Delegation insert failed: ${delError.message}`);
          }
        }
      }

      // Log activity (old table - keep for parallel-run)
      await supabase.from('agent_activity').insert({
        agent_id: agentId,
        project,
        action: 'report_synced',
        details: {
          file,
          findings_count: report.findings.length,
          synced_count: synced
        }
      });

      // Log to agent_runs_v2 (new table) — include usage data if available
      const usageFile = path.join(projectDir, `${date}-${agentId}-usage.json`);
      let usageData: Record<string, any> = {};
      try {
        if (fs.existsSync(usageFile)) {
          usageData = JSON.parse(fs.readFileSync(usageFile, 'utf-8'));
          console.log(`    Usage: $${usageData.total_cost_usd?.toFixed(4)} USD, ${usageData.tokens_input}+${usageData.tokens_output} tokens`);
        }
      } catch (e) {
        console.log(`    Warning: Could not read usage file: ${e}`);
      }

      const { error: runError } = await supabase.from('agent_runs_v2').insert({
        agent_id: agentId,
        project,
        trigger: 'orchestrator',
        status: 'completed',
        findings_count: report.findings.length,
        tokens_used: (usageData.tokens_input || 0) + (usageData.tokens_output || 0) || null,
        cost_estimate: usageData.total_cost_usd || null,
        metadata: usageData.model ? {
          model: usageData.model,
          tokens_input: usageData.tokens_input,
          tokens_output: usageData.tokens_output,
          cache_creation_tokens: usageData.cache_creation_tokens,
          cache_read_tokens: usageData.cache_read_tokens,
          duration_ms: usageData.duration_ms,
          num_turns: usageData.num_turns,
        } : {},
      });

      if (runError) {
        console.log(`    Error logging agent_runs_v2 for ${file}: ${runError.message}`);
      }

    } catch (e) {
      console.log(`    Error processing ${file}:`, e);
    }
  }

  return { synced, skipped };
}

async function main() {
  const args = process.argv.slice(2);
  let targetProject: string | null = null;
  let date = new Date().toISOString().split('T')[0];

  // Parse args
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--date' && args[i + 1]) {
      date = args[i + 1];
      i++;
    } else if (!args[i].startsWith('-')) {
      targetProject = args[i];
    }
  }

  // Load Supabase credentials (env vars first for CI, file fallback for local)
  const url = process.env.SUPABASE_URL || loadEnv().SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || loadEnv().SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (set env vars or ~/.claude/.env)');
    process.exit(1);
  }

  const supabase: SupabaseClientLike = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  console.log(`Syncing reports for date: ${date}`);
  console.log('---');

  const projectsToSync = targetProject
    ? [targetProject]
    : getProjectsFromRegistry();

  let totalSynced = 0;
  let totalSkipped = 0;

  for (const project of projectsToSync) {
    console.log(`\n${project}:`);
    const { synced, skipped } = await syncProject(supabase, project, date);
    totalSynced += synced;
    totalSkipped += skipped;
    console.log(`  ✓ ${synced} synced, ${skipped} skipped (already exists)`);
  }

  console.log('\n---');
  console.log(`Total: ${totalSynced} synced, ${totalSkipped} skipped`);
}

main().catch(console.error);
