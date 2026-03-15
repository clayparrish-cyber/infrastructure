#!/usr/bin/env npx tsx
/**
 * Content Autonomy — Agent Promotion Tiers for Content Pipeline
 *
 * Implements a 4-level promotion system that controls whether content
 * (blog posts, social posts, images) requires human approval before publishing.
 *
 * Levels:
 *   L1 — New agent. All output requires human approval.
 *   L2 — Drafting agent. Can draft, still needs human approval. System provides
 *         shadow recommendations to build trust signal.
 *   L3 — Auto-approve eligible. Agent can auto-approve content based on approval
 *         history (10+ consecutive approvals, 90%+ overall rate).
 *   L4 — Fully autonomous. Self-approving with no human gate. (Future state —
 *         requires explicit opt-in per category via autonomy_rules.metadata.)
 *
 * Usage:
 *   import { getAgentAutonomyLevel, canAutoPublish, evaluatePromotion } from './content-autonomy';
 *
 *   const level = await getAgentAutonomyLevel(supabase, 'content-writer', 'sidelineiq');
 *   if (await canAutoPublish(supabase, 'content-writer', 'sidelineiq')) {
 *     // publish without human gate
 *   }
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Use `any` for Supabase client — no generated types in this repo
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClientLike = any;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AutonomyLevel = 1 | 2 | 3 | 4;

export interface AutonomyAssessment {
  agentId: string;
  project: string;
  decisionCategory: string;
  currentLevel: AutonomyLevel;
  autoPublishAllowed: boolean;
  consecutiveApprovals: number;
  totalDecisions: number;
  approvalRate: number;
  promotionEligible: boolean;
  nextLevelRequirements: string | null;
  assessedAt: string;
}

export interface PromotionResult {
  promoted: boolean;
  previousLevel: AutonomyLevel;
  newLevel: AutonomyLevel;
  reason: string;
}

// ---------------------------------------------------------------------------
// Promotion thresholds
// ---------------------------------------------------------------------------

const PROMOTION_THRESHOLDS: Record<AutonomyLevel, {
  minConsecutiveApprovals: number;
  minTotalDecisions: number;
  minApprovalRate: number;
  minShadowAgreementRate: number;
  maxAutoOverrides: number;
}> = {
  1: {
    // L1 -> L2: Basic trust established
    minConsecutiveApprovals: 5,
    minTotalDecisions: 5,
    minApprovalRate: 0.80,
    minShadowAgreementRate: 0, // shadow not active at L1
    maxAutoOverrides: Infinity,
  },
  2: {
    // L2 -> L3: Strong track record, shadow agrees with human
    minConsecutiveApprovals: 10,
    minTotalDecisions: 15,
    minApprovalRate: 0.90,
    minShadowAgreementRate: 0.80,
    maxAutoOverrides: Infinity,
  },
  3: {
    // L3 -> L4: Exceptional track record, zero overrides in auto-decisions
    minConsecutiveApprovals: 25,
    minTotalDecisions: 50,
    minApprovalRate: 0.95,
    minShadowAgreementRate: 0.90,
    maxAutoOverrides: 0,
  },
  4: {
    // L4 is terminal — no promotion
    minConsecutiveApprovals: Infinity,
    minTotalDecisions: Infinity,
    minApprovalRate: 1,
    minShadowAgreementRate: 1,
    maxAutoOverrides: 0,
  },
};

// Demotion: any rejection resets streak; 2+ rejections in 10 decisions triggers demotion
const DEMOTION_REJECTION_WINDOW = 10;
const DEMOTION_REJECTION_THRESHOLD = 2;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ENV_FILE = path.join(process.env.HOME || '', '.claude', '.env');

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
  } catch {
    // env file not found — rely on process.env
  }
  return env;
}

/**
 * Create a Supabase client from env vars or ~/.claude/.env
 */
export function createSupabaseClient(): any {
  const url = process.env.SUPABASE_URL || loadEnv().SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || loadEnv().SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Derive the decision_category for a content agent + project combination.
 * Content writers use "content-{severity}" or "marketing-content" categories.
 * This function returns the most relevant category to check.
 */
function deriveContentCategory(agentId: string): string {
  if (agentId === 'content-writer') return 'marketing-content';
  if (agentId.includes('content')) return 'content-medium';
  return `content-medium`;
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Calculate the consecutive approval streak for a decision category.
 * Queries decision_log ordered by most recent, counts approvals until
 * the first non-approval decision.
 */
export async function getConsecutiveApprovals(
  supabase: SupabaseClientLike,
  decisionCategory: string,
  project?: string,
): Promise<number> {
  let query = supabase
    .from('decision_log')
    .select('decision')
    .eq('decision_category', decisionCategory)
    .order('created_at', { ascending: false })
    .limit(100);

  if (project) {
    query = query.eq('project', project);
  }

  const { data, error } = await query;

  if (error || !data) return 0;

  let streak = 0;
  for (const row of data) {
    if (row.decision === 'approved' || row.decision === 'acknowledged') {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Get the current autonomy level for an agent's decision category.
 * Reads from autonomy_rules first; falls back to agents.tier.
 */
export async function getAgentAutonomyLevel(
  supabase: SupabaseClientLike,
  agentId: string,
  project?: string,
): Promise<AutonomyAssessment> {
  const category = deriveContentCategory(agentId);

  // 1. Check autonomy_rules for category-level override
  const { data: rule } = await supabase
    .from('autonomy_rules')
    .select('*')
    .eq('decision_category', category)
    .single();

  // 2. Fall back to agents.tier
  const { data: agent } = await supabase
    .from('agents')
    .select('tier')
    .eq('id', agentId)
    .single();

  const currentLevel = Math.min(
    (rule?.current_level || agent?.tier || 1),
    4,
  ) as AutonomyLevel;

  // 3. Get approval history
  const consecutiveApprovals = await getConsecutiveApprovals(supabase, category, project);

  const totalDecisions = rule?.total_decisions || 0;
  const approvalRate = rule?.approval_rate || 0;

  // 4. Check promotion eligibility
  const thresholds = PROMOTION_THRESHOLDS[currentLevel];
  const promotionEligible = currentLevel < 4 &&
    consecutiveApprovals >= thresholds.minConsecutiveApprovals &&
    totalDecisions >= thresholds.minTotalDecisions &&
    approvalRate >= thresholds.minApprovalRate &&
    (rule?.shadow_agreement_rate || 0) >= thresholds.minShadowAgreementRate &&
    (rule?.auto_overrides || 0) <= thresholds.maxAutoOverrides;

  // 5. Describe what's needed for next level
  let nextLevelRequirements: string | null = null;
  if (currentLevel < 4) {
    const needs: string[] = [];
    if (consecutiveApprovals < thresholds.minConsecutiveApprovals) {
      needs.push(`${thresholds.minConsecutiveApprovals - consecutiveApprovals} more consecutive approvals`);
    }
    if (totalDecisions < thresholds.minTotalDecisions) {
      needs.push(`${thresholds.minTotalDecisions - totalDecisions} more total decisions`);
    }
    if (approvalRate < thresholds.minApprovalRate) {
      needs.push(`approval rate ${(approvalRate * 100).toFixed(0)}% < ${(thresholds.minApprovalRate * 100).toFixed(0)}% required`);
    }
    if ((rule?.shadow_agreement_rate || 0) < thresholds.minShadowAgreementRate) {
      needs.push(`shadow agreement rate needs to reach ${(thresholds.minShadowAgreementRate * 100).toFixed(0)}%`);
    }
    nextLevelRequirements = needs.length > 0
      ? `To reach L${currentLevel + 1}: ${needs.join('; ')}`
      : `Eligible for promotion to L${currentLevel + 1}`;
  }

  // 6. Determine auto-publish permission
  //    L3: auto-publish allowed if safety assessment passes
  //    L4: auto-publish always allowed (future state, requires opt-in)
  const l4Enabled = rule?.metadata?.l4_enabled === true;
  const autoPublishAllowed = currentLevel >= 4 ? l4Enabled : currentLevel >= 3;

  return {
    agentId,
    project: project || '*',
    decisionCategory: category,
    currentLevel,
    autoPublishAllowed,
    consecutiveApprovals,
    totalDecisions,
    approvalRate,
    promotionEligible,
    nextLevelRequirements,
    assessedAt: new Date().toISOString(),
  };
}

/**
 * Quick check: can this agent auto-publish content without human approval?
 *
 * This is the primary integration point for content pipeline publish steps.
 * Call this before deciding whether to publish immediately or queue for review.
 */
export async function canAutoPublish(
  supabase: SupabaseClientLike,
  agentId: string,
  project?: string,
): Promise<boolean> {
  const assessment = await getAgentAutonomyLevel(supabase, agentId, project);
  return assessment.autoPublishAllowed;
}

/**
 * Evaluate whether an agent should be promoted or demoted.
 * Call this after a human decision (approval/rejection) is recorded.
 *
 * Returns a PromotionResult. If promoted/demoted, updates autonomy_rules
 * and agents.tier in Supabase.
 */
export async function evaluatePromotion(
  supabase: SupabaseClientLike,
  agentId: string,
  decisionCategory?: string,
): Promise<PromotionResult> {
  const category = decisionCategory || deriveContentCategory(agentId);

  // Get current rule
  const { data: rule } = await supabase
    .from('autonomy_rules')
    .select('*')
    .eq('decision_category', category)
    .single();

  const currentLevel = (rule?.current_level || 1) as AutonomyLevel;

  // Check for demotion first
  const { data: recentDecisions } = await supabase
    .from('decision_log')
    .select('decision')
    .eq('decision_category', category)
    .order('created_at', { ascending: false })
    .limit(DEMOTION_REJECTION_WINDOW);

  if (recentDecisions && currentLevel > 1) {
    const recentRejections = recentDecisions.filter(
      (d: any) => d.decision === 'rejected',
    ).length;

    if (recentRejections >= DEMOTION_REJECTION_THRESHOLD) {
      const newLevel = Math.max(1, currentLevel - 1) as AutonomyLevel;

      // Demote in autonomy_rules
      if (rule) {
        await supabase
          .from('autonomy_rules')
          .update({
            current_level: newLevel,
            demoted_at: new Date().toISOString(),
            last_evaluated_at: new Date().toISOString(),
          })
          .eq('decision_category', category);
      }

      // Demote in agents table
      await supabase
        .from('agents')
        .update({ tier: newLevel })
        .eq('id', agentId);

      return {
        promoted: false,
        previousLevel: currentLevel,
        newLevel,
        reason: `Demoted: ${recentRejections} rejections in last ${DEMOTION_REJECTION_WINDOW} decisions`,
      };
    }
  }

  // Check promotion eligibility
  const consecutiveApprovals = await getConsecutiveApprovals(supabase, category);
  const thresholds = PROMOTION_THRESHOLDS[currentLevel];

  if (currentLevel >= 4) {
    return {
      promoted: false,
      previousLevel: currentLevel,
      newLevel: currentLevel,
      reason: 'Already at maximum level (L4)',
    };
  }

  const totalDecisions = rule?.total_decisions || 0;
  const approvalRate = rule?.approval_rate || 0;
  const shadowAgreementRate = rule?.shadow_agreement_rate || 0;
  const autoOverrides = rule?.auto_overrides || 0;

  const meetsConsecutive = consecutiveApprovals >= thresholds.minConsecutiveApprovals;
  const meetsTotal = totalDecisions >= thresholds.minTotalDecisions;
  const meetsApproval = approvalRate >= thresholds.minApprovalRate;
  const meetsShadow = shadowAgreementRate >= thresholds.minShadowAgreementRate;
  const meetsOverrides = autoOverrides <= thresholds.maxAutoOverrides;

  if (meetsConsecutive && meetsTotal && meetsApproval && meetsShadow && meetsOverrides) {
    const newLevel = (currentLevel + 1) as AutonomyLevel;

    // Promote in autonomy_rules
    if (rule) {
      await supabase
        .from('autonomy_rules')
        .update({
          current_level: newLevel,
          promoted_at: new Date().toISOString(),
          auto_graduated_at: new Date().toISOString(),
          last_evaluated_at: new Date().toISOString(),
        })
        .eq('decision_category', category);
    } else {
      // Create autonomy_rules entry if it doesn't exist
      await supabase
        .from('autonomy_rules')
        .insert({
          decision_category: category,
          current_level: newLevel,
          total_decisions: totalDecisions,
          approval_rate: approvalRate,
          promoted_at: new Date().toISOString(),
          auto_graduated_at: new Date().toISOString(),
          last_evaluated_at: new Date().toISOString(),
        });
    }

    // Promote in agents table
    await supabase
      .from('agents')
      .update({ tier: newLevel })
      .eq('id', agentId);

    return {
      promoted: true,
      previousLevel: currentLevel,
      newLevel,
      reason: `Promoted: ${consecutiveApprovals} consecutive approvals, ${(approvalRate * 100).toFixed(0)}% approval rate, ${totalDecisions} total decisions`,
    };
  }

  // Not eligible yet — return what's missing
  const missing: string[] = [];
  if (!meetsConsecutive) missing.push(`need ${thresholds.minConsecutiveApprovals} consecutive approvals (have ${consecutiveApprovals})`);
  if (!meetsTotal) missing.push(`need ${thresholds.minTotalDecisions} total decisions (have ${totalDecisions})`);
  if (!meetsApproval) missing.push(`need ${(thresholds.minApprovalRate * 100).toFixed(0)}% approval rate (have ${(approvalRate * 100).toFixed(0)}%)`);
  if (!meetsShadow) missing.push(`need ${(thresholds.minShadowAgreementRate * 100).toFixed(0)}% shadow agreement (have ${(shadowAgreementRate * 100).toFixed(0)}%)`);

  return {
    promoted: false,
    previousLevel: currentLevel,
    newLevel: currentLevel,
    reason: `Not eligible: ${missing.join('; ')}`,
  };
}

/**
 * Record a content publish decision and evaluate promotion.
 *
 * Call this from the content pipeline after a human approves or rejects
 * a content item. It logs the decision and checks whether the agent
 * should be promoted or demoted.
 */
export async function recordContentDecision(
  supabase: SupabaseClientLike,
  workItemId: string,
  agentId: string,
  project: string,
  decision: 'approved' | 'rejected' | 'deferred',
  actor: string = 'human',
): Promise<{
  decision: string;
  promotion: PromotionResult;
}> {
  const category = deriveContentCategory(agentId);

  // Get current autonomy level
  const { data: rule } = await supabase
    .from('autonomy_rules')
    .select('current_level')
    .eq('decision_category', category)
    .single();

  const autonomyLevel = rule?.current_level || 1;

  // Log decision
  await supabase.from('decision_log').insert({
    work_item_id: workItemId,
    decision_category: category,
    decision,
    actor,
    autonomy_level_at_time: autonomyLevel,
    project,
    agent_function: agentId,
  });

  // Update autonomy metrics via RPC (if it exists)
  try {
    await supabase.rpc('update_autonomy_metrics', { p_category: category });
  } catch {
    // RPC may not exist — non-blocking
  }

  // Evaluate promotion
  const promotion = await evaluatePromotion(supabase, agentId, category);

  return { decision, promotion };
}

// ---------------------------------------------------------------------------
// CLI entry point — run standalone for diagnostics
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const agentId = args[0] || 'content-writer';
  const project = args[1];

  const supabase = createSupabaseClient();

  console.log(`\nContent Autonomy Assessment`);
  console.log(`Agent: ${agentId}`);
  if (project) console.log(`Project: ${project}`);
  console.log('---');

  const assessment = await getAgentAutonomyLevel(supabase, agentId, project);

  console.log(`Level: L${assessment.currentLevel}`);
  console.log(`Auto-publish: ${assessment.autoPublishAllowed ? 'YES' : 'NO'}`);
  console.log(`Consecutive approvals: ${assessment.consecutiveApprovals}`);
  console.log(`Total decisions: ${assessment.totalDecisions}`);
  console.log(`Approval rate: ${(assessment.approvalRate * 100).toFixed(0)}%`);
  console.log(`Promotion eligible: ${assessment.promotionEligible ? 'YES' : 'NO'}`);
  if (assessment.nextLevelRequirements) {
    console.log(`Next level: ${assessment.nextLevelRequirements}`);
  }

  if (args.includes('--evaluate')) {
    console.log('\n--- Evaluating promotion ---');
    const result = await evaluatePromotion(supabase, agentId);
    console.log(`Result: ${result.promoted ? 'PROMOTED' : 'No change'}`);
    console.log(`${result.previousLevel} -> ${result.newLevel}`);
    console.log(`Reason: ${result.reason}`);
  }
}

// Run if called directly
const isMainModule = process.argv[1]?.endsWith('content-autonomy.ts');
if (isMainModule) {
  main().catch(console.error);
}
