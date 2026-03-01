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

const PROJECT_TEST_REGISTRY: Record<string, {
  hasAutomatedTests: boolean;
  frameworks: string[];
  confidence: 'high' | 'medium' | 'low';
}> = {
  sidelineiq: { hasAutomatedTests: true, frameworks: ['jest'], confidence: 'high' },
  dosie: { hasAutomatedTests: true, frameworks: ['jest'], confidence: 'high' },
  'glossy-sports': { hasAutomatedTests: true, frameworks: ['jest'], confidence: 'high' },
  airtip: { hasAutomatedTests: true, frameworks: ['vitest'], confidence: 'medium' },
  'gt-ops': { hasAutomatedTests: true, frameworks: ['vitest'], confidence: 'high' },
  'menu-autopilot': { hasAutomatedTests: true, frameworks: ['vitest'], confidence: 'high' },
  scout: { hasAutomatedTests: false, frameworks: [], confidence: 'high' },
  'mainline-apps': { hasAutomatedTests: true, frameworks: ['jest'], confidence: 'medium' },
  'mainline-dashboard': { hasAutomatedTests: true, frameworks: ['jest'], confidence: 'high' },
  infrastructure: { hasAutomatedTests: true, frameworks: ['vitest'], confidence: 'high' },
};

const HIGH_RISK_TERMS = [
  'auth', 'login', 'signup', 'password', 'token', 'secret', 'security',
  'billing', 'payment', 'subscription', 'purchase', 'restore', 'entitlement',
  'revenue', 'app store', 'app review', 'schema', 'migration', 'database',
  'delete', 'encryption', 'privacy', 'webhook', 'sync',
];
const MEDIUM_RISK_TERMS = [
  'onboarding', 'notification', 'api', 'cache', 'queue', 'worker',
  'performance', 'navigation', 'routing', 'state', 'store',
];
const NO_TEST_NEEDED_TERMS = ['copy', 'content', 'brand', 'visual', 'layout', 'polish', 'typo', 'text'];

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
  const approvals = recentDecisions.filter((d: any) => d.decision === 'approved' || d.decision === 'acknowledged').length;
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

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean);
}

function hasAnyTerm(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function collectItemText(item: any): string {
  const metadata = toRecord(item.metadata);
  const parts = [
    item.title,
    item.description || '',
    ...toStringArray(metadata.files),
    typeof metadata.suggested_fix === 'string' ? metadata.suggested_fix : '',
    typeof metadata.severity === 'string' ? metadata.severity : '',
  ];

  return parts.join(' ').toLowerCase();
}

function deriveBlastRadius(item: any): { level: 'low' | 'medium' | 'high'; reasons: string[] } {
  const metadata = toRecord(item.metadata);
  const text = collectItemText(item);
  const fileCount = toStringArray(metadata.files).length;
  const reasons: string[] = [];
  let level: 'low' | 'medium' | 'high' = 'low';

  if (item.priority === 'critical' || item.priority === 'high') {
    level = 'high';
    reasons.push(`Priority ${item.priority} findings do not qualify for autonomous approval.`);
  }

  if (hasAnyTerm(text, HIGH_RISK_TERMS)) {
    level = 'high';
    reasons.push('Finding touches a high-risk surface such as auth, billing, subscriptions, data, or security.');
  }

  if (level !== 'high' && (item.priority === 'medium' || fileCount > 2 || hasAnyTerm(text, MEDIUM_RISK_TERMS))) {
    level = 'medium';
  }

  if (level === 'medium') {
    if (item.priority === 'medium') reasons.push('Medium-priority findings require stronger validation than trivial issues.');
    if (fileCount > 2) reasons.push(`Finding references ${fileCount} files, so blast radius is not trivial.`);
    if (hasAnyTerm(text, MEDIUM_RISK_TERMS)) reasons.push('Finding touches product flow or runtime infrastructure that can regress broader behavior.');
  }

  if (level === 'low' && reasons.length === 0) {
    reasons.push('Finding looks localized and low-risk based on severity, wording, and file scope.');
  }

  return { level, reasons };
}

function deriveTestValidation(item: any, blastRadius: 'low' | 'medium' | 'high') {
  const metadata = toRecord(item.metadata);
  const text = collectItemText(item);
  const profile = PROJECT_TEST_REGISTRY[item.project];
  const explicitValidation = Boolean(
    typeof metadata.test_command === 'string'
    || typeof metadata.verification_command === 'string'
    || typeof metadata.test_plan === 'string'
    || typeof metadata.validation_steps === 'string'
  );

  if (explicitValidation) {
    return {
      status: 'verified',
      passed: true,
      frameworks: profile?.frameworks || [],
      reason: 'Finding carries an explicit validation or test command in metadata.',
    };
  }

  if (blastRadius === 'low' && hasAnyTerm(text, NO_TEST_NEEDED_TERMS)) {
    return {
      status: 'not_required',
      passed: true,
      frameworks: profile?.frameworks || [],
      reason: 'Finding appears to be copy/layout/polish work where automated tests are not the primary safety rail.',
    };
  }

  if (profile?.hasAutomatedTests) {
    return {
      status: 'available',
      passed: true,
      frameworks: profile.frameworks,
      reason: profile.confidence === 'high'
        ? `Project has committed ${profile.frameworks.join('/')} coverage that can validate implementation.`
        : `Project has some ${profile.frameworks.join('/')} coverage, but validation is not comprehensive.`,
    };
  }

  return {
    status: 'missing',
    passed: blastRadius === 'low',
    frameworks: [],
    reason: blastRadius === 'low'
      ? 'No automated tests are known for this project, but the item still appears low-risk.'
      : 'No automated tests are known for this project, so higher-risk findings must stay behind a human gate.',
  };
}

function assessAutonomySafety(item: any) {
  const blastRadius = deriveBlastRadius(item);
  const confidenceScore = typeof item.system_confidence === 'number' ? item.system_confidence : null;
  const confidenceThreshold = blastRadius.level === 'medium' ? 0.9 : 0.8;
  const confidencePassed = confidenceScore !== null && confidenceScore >= confidenceThreshold;
  const testValidation = deriveTestValidation(item, blastRadius.level);
  const blockers: string[] = [];

  if (blastRadius.level === 'high') blockers.push('Blast radius is high.');
  if (!confidencePassed) {
    blockers.push(confidenceScore === null
      ? 'No shadow confidence exists yet, so the system cannot justify autonomous approval.'
      : `System confidence ${(confidenceScore * 100).toFixed(0)}% is below the ${(confidenceThreshold * 100).toFixed(0)}% threshold.`);
  }
  if (blastRadius.level === 'medium' && testValidation.status !== 'verified' && testValidation.status !== 'available') {
    blockers.push('Medium-blast findings need a project test harness or explicit validation plan.');
  }

  const autoApproveEligible = blastRadius.level !== 'high'
    && confidencePassed
    && (blastRadius.level === 'low' ? testValidation.passed : (testValidation.status === 'verified' || testValidation.status === 'available'));

  return {
    version: 1,
    assessedAt: new Date().toISOString(),
    autoApproveEligible,
    summary: autoApproveEligible
      ? `Safe to auto-approve: ${blastRadius.level} blast radius, ${((confidenceScore || 0) * 100).toFixed(0)}% confidence, ${testValidation.status.replace('_', ' ')} validation.`
      : `Human gate required: ${blockers[0] || 'safety thresholds were not met.'}`,
    blockers,
    confidence: {
      score: confidenceScore,
      threshold: confidenceThreshold,
      passed: confidencePassed,
      reason: confidenceScore === null
        ? 'No shadow confidence exists yet, so the system cannot justify autonomous approval.'
        : confidencePassed
          ? `System confidence ${(confidenceScore * 100).toFixed(0)}% clears the ${(confidenceThreshold * 100).toFixed(0)}% threshold.`
          : `System confidence ${(confidenceScore * 100).toFixed(0)}% is below the ${(confidenceThreshold * 100).toFixed(0)}% threshold.`,
    },
    blastRadius: {
      level: blastRadius.level,
      passed: blastRadius.level !== 'high',
      reasons: blastRadius.reasons,
    },
    testValidation,
  };
}

async function assessAndPersistAutonomySafety(
  supabase: SupabaseClientLike,
  workItemId: string
): Promise<any | null> {
  const { data: item, error: fetchError } = await supabase
    .from('work_items')
    .select('id, type, project, title, description, priority, metadata, system_confidence, source_type')
    .eq('id', workItemId)
    .single();

  if (fetchError || !item) return null;

  const assessment = assessAutonomySafety(item);
  const metadata = toRecord(item.metadata);
  const { error: updateError } = await supabase
    .from('work_items')
    .update({
      metadata: {
        ...metadata,
        autonomy_safety: assessment,
      },
    })
    .eq('id', workItemId);

  if (updateError) {
    console.log(`      Autonomy safety persist error (non-blocking): ${updateError.message}`);
  }

  return assessment;
}

// =============================================================================
// Auto-Approve — auto-approves findings for L3+ categories
// Mirrors dashboard/src/lib/server/auto-approve.ts logic
// =============================================================================

async function maybeAutoApprove(
  supabase: SupabaseClientLike,
  workItemId: string,
  category: string,
  assessment?: any
): Promise<void> {
  // Delegations are auto-approved by the creating agent — skip
  if (category.startsWith('delegation-')) return;

  const { data: rule } = await supabase
    .from('autonomy_rules')
    .select('current_level')
    .eq('decision_category', category)
    .single();

  if (!rule || (rule.current_level || 1) < 3) return;

  const safety = assessment || await assessAndPersistAutonomySafety(supabase, workItemId);
  if (!safety?.autoApproveEligible) {
    await supabase.from('work_item_events').insert({
      work_item_id: workItemId,
      event_type: 'auto_approval_blocked',
      from_status: 'discovered',
      to_status: 'discovered',
      actor: 'system',
      actor_type: 'system',
      notes: safety?.summary || 'Auto-approval blocked by safety assessment.',
      metadata: {
        decision_category: category,
        autonomy_level: rule.current_level,
        autonomy_safety: safety,
      },
    });
    console.log(`      Auto-approval blocked: ${safety?.summary || 'safety thresholds were not met'}`);
    return;
  }

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
    metadata: {
      autonomy_level: rule.current_level,
      decision_category: category,
      autonomy_safety: safety,
    } as any,
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
          suggested_fix: finding.suggestedFix || null,
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

            let safetyAssessment: any = null;
            try {
              safetyAssessment = await assessAndPersistAutonomySafety(supabase, workItem.id);
            } catch (e) {
              console.log(`      Autonomy safety error (non-blocking): ${e}`);
            }

            // L3+ Auto-approve — bypasses human gate
            try {
              await maybeAutoApprove(supabase, workItem.id, decisionCategory, safetyAssessment);
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
              type: 'task',
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
                delegation_kind: 'specialist',
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
