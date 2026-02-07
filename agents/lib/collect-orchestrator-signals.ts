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

const supabase = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const signals: Record<string, unknown> = {};

  // 1. Git activity
  try {
    const scannerPath = path.join(process.env.HOME || '', '.claude', 'agents', 'lib', 'git-activity-scanner.sh');
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

  // Write to /tmp
  const outputPath = '/tmp/orchestrator-signals.json';
  fs.writeFileSync(outputPath, JSON.stringify(signals, null, 2));
  console.log(`Signals written to ${outputPath}`);
  console.log(`  Git activity: ${Object.keys(signals.git_activity as Record<string, unknown>).length} projects`);
  console.log(`  Budget data: ${Object.keys(signals.budget_summaries as Record<string, unknown>).length} agents`);
  console.log(`  Critical items: ${JSON.stringify(signals.critical_work_items)}`);
}

main().catch(console.error);
