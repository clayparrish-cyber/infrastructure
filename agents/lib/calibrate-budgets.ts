#!/usr/bin/env npx tsx
/**
 * Budget Calibration — analyzes historical cost data and recommends
 * enforcement_mode changes per agent.
 *
 * Run after 30+ days of data collection to calibrate budgets.
 * Usage: npx tsx calibrate-budgets.ts [--apply]
 *
 * Without --apply: prints recommendations only (dry run)
 * With --apply: updates agents table with recommended enforcement_mode
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

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
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const applyMode = process.argv.includes('--apply');

async function main() {
  console.log(`Budget Calibration Tool — ${applyMode ? 'APPLY MODE' : 'DRY RUN'}`);
  console.log('='.repeat(60));

  const { data: agents } = await supabase
    .from('agents')
    .select('id, name, budget_monthly, budget_enforcement_mode, status')
    .eq('status', 'active');

  if (!agents || agents.length === 0) {
    console.log('No active agents found.');
    return;
  }

  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const { data: runs } = await supabase
    .from('agent_runs_v2')
    .select('agent_id, cost_estimate, started_at')
    .gte('started_at', threeMonthsAgo.toISOString())
    .eq('status', 'completed')
    .not('cost_estimate', 'is', null);

  const costMap = new Map<string, Map<string, number>>();
  for (const run of (runs || [])) {
    const agentId = run.agent_id;
    const monthKey = new Date(run.started_at).toISOString().slice(0, 7);
    const cost = Number(run.cost_estimate) || 0;
    if (!costMap.has(agentId)) costMap.set(agentId, new Map());
    costMap.get(agentId)!.set(monthKey, (costMap.get(agentId)!.get(monthKey) || 0) + cost);
  }

  console.log(`\n${'Agent'.padEnd(30)} ${'Mode'.padEnd(10)} ${'Current'.padEnd(10)} ${'Rec Budget'.padEnd(12)} ${'Rec Mode'.padEnd(10)} Reason`);
  console.log('-'.repeat(120));

  let changesCount = 0;

  for (const agent of agents.sort((a, b) => {
    const aAvg = costMap.get(a.id) ? Array.from(costMap.get(a.id)!.values()).reduce((s, v) => s + v, 0) / costMap.get(a.id)!.size : 0;
    const bAvg = costMap.get(b.id) ? Array.from(costMap.get(b.id)!.values()).reduce((s, v) => s + v, 0) / costMap.get(b.id)!.size : 0;
    return bAvg - aAvg;
  })) {
    const agentMonths = costMap.get(agent.id);
    const monthlySpends = agentMonths ? Array.from(agentMonths.values()) : [];
    const dataMonths = monthlySpends.length;
    const currentBudget = agent.budget_monthly || 0;
    const currentMode = agent.budget_enforcement_mode || 'observe';

    let recommendedBudget: number;
    let recommendedMode: string;
    let reason: string;

    if (dataMonths === 0) {
      recommendedBudget = currentBudget || 5;
      recommendedMode = 'observe';
      reason = 'No cost data yet — keep observing';
    } else {
      const avgMonthly = monthlySpends.reduce((s, v) => s + v, 0) / dataMonths;
      const maxMonthly = Math.max(...monthlySpends);
      const variance = monthlySpends.reduce((s, v) => s + (v - avgMonthly) ** 2, 0) / dataMonths;
      const stdDev = Math.sqrt(variance);
      const cv = avgMonthly > 0 ? stdDev / avgMonthly : 0;

      recommendedBudget = Math.max(1, Math.ceil(Math.max(avgMonthly * 1.5, maxMonthly * 1.2)));

      if (dataMonths < 2) {
        recommendedMode = 'observe';
        reason = `Only ${dataMonths} month(s) of data — keep observing`;
      } else if (cv > 0.5) {
        recommendedMode = 'warn';
        reason = `High cost variance (CV=${cv.toFixed(2)}) — warn but don't block`;
      } else {
        recommendedMode = 'warn';
        reason = `Stable costs (avg $${avgMonthly.toFixed(2)}/mo, ${dataMonths} months) — safe to warn`;
      }
    }

    const modeChanged = recommendedMode !== currentMode;
    const budgetChanged = Math.abs(recommendedBudget - currentBudget) > 1;
    const marker = modeChanged || budgetChanged ? '>>>' : '   ';

    console.log(
      `${marker} ${agent.name.padEnd(27)} ${currentMode.padEnd(10)} $${currentBudget.toFixed(0).padStart(7)} $${recommendedBudget.toFixed(0).padStart(9)} ${recommendedMode.padEnd(10)} ${reason}`
    );

    if (modeChanged || budgetChanged) {
      changesCount++;
      if (applyMode) {
        const updates: Record<string, unknown> = {};
        if (budgetChanged) updates.budget_monthly = recommendedBudget;
        if (modeChanged) updates.budget_enforcement_mode = recommendedMode;

        const { error } = await supabase.from('agents').update(updates).eq('id', agent.id);
        if (error) {
          console.log(`  FAILED: ${agent.id} — ${error.message}`);
        } else {
          console.log(`  Updated: ${agent.name}`);
        }
      }
    }
  }

  console.log(`\n${changesCount} agents with recommended changes.`);
  if (!applyMode && changesCount > 0) {
    console.log('Run with --apply to execute these changes.');
  }
}

main().catch(console.error);
