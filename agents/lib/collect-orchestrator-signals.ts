#!/usr/bin/env npx tsx
/**
 * Collects signals for the Orchestrator agent.
 * Writes to /tmp/orchestrator-signals.json.
 *
 * Signals collected:
 * - Git activity per project (from git-activity-scanner.sh)
 * - Budget summaries per agent (from Supabase agent_budget_summary view)
 * - Staleness per agent-project (from agent_runs_v2)
 * - Critical work items per project (from work_items)
 * - Current date and day of week
 *
 * Usage: npx tsx collect-orchestrator-signals.ts
 */

import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Load env
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

// Env vars first (CI), file fallback (local)
const supabaseUrl = process.env.SUPABASE_URL || env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const signals: Record<string, unknown> = {};

  // 1. Git activity
  try {
    const scannerPath = process.env.SCANNER_PATH
      || path.join(process.env.HOME || '', '.claude', 'agents', 'lib', 'git-activity-scanner.sh');
    const gitOutput = execSync(`bash "${scannerPath}"`, { encoding: 'utf-8', timeout: 30000 });
    signals.git_activity = JSON.parse(gitOutput);
  } catch (err) {
    console.error('Git scanner failed, using empty data:', err);
    signals.git_activity = {};
  }

  // 2. Budget summaries
  try {
    const { data: budgets } = await supabase
      .from('agent_budget_summary')
      .select('*');
    signals.budget_summaries = (budgets || []).reduce((acc: Record<string, unknown>, b: Record<string, unknown>) => {
      acc[b.agent_id as string] = {
        budget_monthly: b.budget_monthly,
        cost_this_month: b.cost_this_month,
        pct_used: b.budget_pct_used,
        runs_this_month: b.runs_this_month,
      };
      return acc;
    }, {});
  } catch {
    signals.budget_summaries = {};
  }

  // 2b. Auto-adjust budgets (self-learning)
  try {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const { data: costData } = await supabase
      .from('agent_runs_v2')
      .select('agent_id, cost_estimate, started_at')
      .gte('started_at', threeMonthsAgo.toISOString())
      .not('cost_estimate', 'is', null);

    const { data: agentRows } = await supabase
      .from('agents')
      .select('id, budget_monthly')
      .eq('status', 'active');

    if (costData && agentRows) {
      // Group costs by agent_id and month
      const monthlyCosts: Record<string, Record<string, number>> = {};
      const now = new Date();
      const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      for (const run of costData) {
        const agentId = run.agent_id as string;
        const cost = (run.cost_estimate as number) || 0;
        const runDate = new Date(run.started_at as string);
        const monthKey = `${runDate.getFullYear()}-${String(runDate.getMonth() + 1).padStart(2, '0')}`;

        if (!monthlyCosts[agentId]) monthlyCosts[agentId] = {};
        monthlyCosts[agentId][monthKey] = (monthlyCosts[agentId][monthKey] || 0) + cost;
      }

      const budgetAdjustments: Record<string, { current: number; recommended: number; reason: string }> = {};

      for (const agent of agentRows) {
        const agentId = agent.id as string;
        const currentBudget = (agent.budget_monthly as number) || 0;
        const agentMonths = monthlyCosts[agentId];
        if (!agentMonths || Object.keys(agentMonths).length === 0) continue;

        // Calculate average monthly spend
        const monthlyTotals = Object.values(agentMonths);
        const avgMonthly = monthlyTotals.reduce((sum, v) => sum + v, 0) / monthlyTotals.length;

        // Current month cost (may be partial)
        const currentMonthCost = agentMonths[currentMonthKey] || 0;

        // recommended = max(avg * 1.5, current_month * 1.2), rounded up to nearest dollar
        const recommended = Math.ceil(Math.max(avgMonthly * 1.5, currentMonthCost * 1.2));

        // Only adjust if differs by more than 20%
        if (currentBudget === 0 || Math.abs(recommended - currentBudget) / currentBudget > 0.2) {
          budgetAdjustments[agentId] = {
            current: currentBudget,
            recommended,
            reason: `avg_monthly=$${avgMonthly.toFixed(2)}, current_month=$${currentMonthCost.toFixed(2)}`,
          };

          // Update the agents table
          await supabase
            .from('agents')
            .update({ budget_monthly: recommended })
            .eq('id', agentId);
        }
      }

      signals.budget_adjustments = budgetAdjustments;
      if (Object.keys(budgetAdjustments).length > 0) {
        console.log(`  Budget auto-adjusted: ${JSON.stringify(budgetAdjustments)}`);
      }
    }
  } catch (err) {
    console.error('Budget auto-adjust failed:', err);
    signals.budget_adjustments = {};
  }

  // 3. Staleness (days since last run per agent-project)
  try {
    const { data: agents } = await supabase
      .from('agents')
      .select('id, projects, status')
      .eq('status', 'active');

    const { data: runs } = await supabase
      .from('agent_runs_v2')
      .select('agent_id, project, started_at')
      .eq('status', 'completed')
      .order('started_at', { ascending: false });

    const lastRunMap = new Map<string, string>();
    for (const run of (runs || [])) {
      const key = `${run.agent_id}|${run.project}`;
      if (!lastRunMap.has(key)) {
        lastRunMap.set(key, run.started_at);
      }
    }

    const now = Date.now();
    const stalenessData: Record<string, Record<string, number>> = {};
    for (const agent of (agents || [])) {
      stalenessData[agent.id] = {};
      for (const project of (agent.projects || [])) {
        const key = `${agent.id}|${project}`;
        const lastRun = lastRunMap.get(key);
        stalenessData[agent.id][project] = lastRun
          ? Math.floor((now - new Date(lastRun).getTime()) / (1000 * 60 * 60 * 24))
          : 999;
      }
    }
    signals.staleness = stalenessData;
  } catch {
    signals.staleness = {};
  }

  // 4. Critical/high priority work items per project
  try {
    const { data: items } = await supabase
      .from('work_items')
      .select('project, priority')
      .in('priority', ['critical', 'high'])
      .in('status', ['discovered', 'triaged', 'approved', 'in_progress']);

    const criticalByProject: Record<string, number> = {};
    for (const item of (items || [])) {
      criticalByProject[item.project] = (criticalByProject[item.project] || 0) + 1;
    }
    signals.critical_work_items = criticalByProject;
  } catch {
    signals.critical_work_items = {};
  }

  // 5. Date info
  const now = new Date();
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  signals.today = {
    date: now.toISOString().split('T')[0],
    day_of_week: days[now.getDay()],
    day_number: now.getDay(), // 0=Sun, 6=Sat
    week_number: Math.ceil((now.getDate() - now.getDay() + 1) / 7),
  };

  // 6. Active agents (for the orchestrator to reference)
  try {
    const { data: activeAgents } = await supabase
      .from('agents')
      .select('id, name, role, projects, schedule, budget_monthly, status')
      .eq('status', 'active');
    signals.active_agents = activeAgents || [];
  } catch {
    signals.active_agents = [];
  }

  // Write to configurable output path (env var for CI, /tmp default for local)
  const outputPath = process.env.SIGNALS_OUTPUT || '/tmp/orchestrator-signals.json';
  fs.writeFileSync(outputPath, JSON.stringify(signals, null, 2));
  console.log(`Signals written to ${outputPath}`);
  console.log(`  Git activity: ${Object.keys(signals.git_activity as Record<string, unknown>).length} projects`);
  console.log(`  Budget data: ${Object.keys(signals.budget_summaries as Record<string, unknown>).length} agents`);
  console.log(`  Critical items: ${JSON.stringify(signals.critical_work_items)}`);
}

main().catch(console.error);
