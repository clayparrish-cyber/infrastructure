#!/usr/bin/env npx tsx
/**
 * Collects signals for the Orchestrator agent.
 * Writes to /tmp/orchestrator-signals.json.
 *
 * Signals collected:
 * - Git activity per project (from git-activity-scanner.sh)
 * - Business priorities and Command Center high/critical counts
 * - Acceptance rates per agent (last 30 days)
 * - Project phases from registry.json
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
import { fileURLToPath } from 'url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = path.resolve(SCRIPT_DIR, '..');
const DEFAULT_REGISTRY_PATH = path.join(AGENTS_DIR, 'registry.json');
const DEFAULT_PRIORITIES_PATH = path.join(AGENTS_DIR, 'priorities.json');
const OPEN_WORK_ITEM_STATUSES = ['discovered', 'triaged', 'approved', 'in_progress', 'review'];

type RegistryProject = {
  phase?: string;
};

type PrioritiesFile = {
  updated?: string;
  focus_projects?: string[];
  context?: Record<string, string>;
  deprioritize?: string[];
};

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

function readRegistryProjects(): Record<string, RegistryProject> {
  const registryPath = process.env.REGISTRY_PATH || DEFAULT_REGISTRY_PATH;
  const registry = readJsonFile<{ projects?: Record<string, RegistryProject> }>(registryPath, {});
  return registry.projects || {};
}

function readPrioritiesFile(): PrioritiesFile {
  const prioritiesPath = process.env.PRIORITIES_PATH || DEFAULT_PRIORITIES_PATH;
  return readJsonFile<PrioritiesFile>(prioritiesPath, {});
}

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
const commandCenterUrl = process.env.COMMAND_CENTER_URL || env.COMMAND_CENTER_URL;
const commandCenterApiKey = process.env.COMMAND_CENTER_API_KEY || env.COMMAND_CENTER_API_KEY;
const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

async function fetchOpenHighPriorityCounts(projects: string[]): Promise<Record<string, number>> {
  if (!commandCenterUrl || !commandCenterApiKey) {
    return {};
  }

  const counts: Record<string, number> = {};

  await Promise.all(projects.map(async (project) => {
    try {
      const url = new URL('/api/work-items', commandCenterUrl);
      url.searchParams.set('project', project);
      url.searchParams.set('status', OPEN_WORK_ITEM_STATUSES.join(','));
      url.searchParams.set('limit', '200');

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${commandCenterApiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Command Center returned HTTP ${response.status}`);
      }

      const payload = await response.json() as { items?: Array<{ priority?: string | null }> };
      const items = Array.isArray(payload.items) ? payload.items : [];
      counts[project] = items.filter((item) => {
        const priority = typeof item?.priority === 'string' ? item.priority.toLowerCase() : '';
        return priority === 'high' || priority === 'critical';
      }).length;
    } catch {
      counts[project] = 0;
    }
  }));

  return counts;
}

async function fetchBusinessPriorities(): Promise<Record<string, unknown>> {
  const priorities = readPrioritiesFile();
  const projects = Object.keys(readRegistryProjects());
  const highPriorityCounts = await fetchOpenHighPriorityCounts(projects);

  return {
    updated: priorities.updated || null,
    focus_projects: Array.isArray(priorities.focus_projects) ? priorities.focus_projects : [],
    context: priorities.context && typeof priorities.context === 'object' ? priorities.context : {},
    deprioritize: Array.isArray(priorities.deprioritize) ? priorities.deprioritize : [],
    high_priority_counts: highPriorityCounts,
  };
}

async function fetchAcceptanceRates(): Promise<Record<string, unknown>> {
  if (!supabase) {
    return {};
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: decisions, error } = await supabase
    .from('decision_log')
    .select('decision, agent_function, work_item:work_item_id(source_id)')
    .gte('created_at', thirtyDaysAgo.toISOString())
    .order('created_at', { ascending: false });

  if (error || !decisions) {
    return {};
  }

  const acceptanceRates: Record<string, { approval_rate: number; approvals: number; rejections: number; deferrals: number; total_decisions: number }> = {};

  for (const row of decisions) {
    const agentId = resolveDecisionAgentId(row);
    if (!agentId) continue;

    if (!acceptanceRates[agentId]) {
      acceptanceRates[agentId] = {
        approval_rate: 0,
        approvals: 0,
        rejections: 0,
        deferrals: 0,
        total_decisions: 0,
      };
    }

    acceptanceRates[agentId].total_decisions += 1;
    if (row.decision === 'approved' || row.decision === 'acknowledged') {
      acceptanceRates[agentId].approvals += 1;
    } else if (row.decision === 'rejected') {
      acceptanceRates[agentId].rejections += 1;
    } else if (row.decision === 'deferred') {
      acceptanceRates[agentId].deferrals += 1;
    }
  }

  for (const stats of Object.values(acceptanceRates)) {
    stats.approval_rate = stats.total_decisions > 0
      ? Math.round((stats.approvals / stats.total_decisions) * 100) / 100
      : 0;
  }

  return acceptanceRates;
}

function fetchProjectPhases(): Record<string, string> {
  const projects = readRegistryProjects();
  return Object.entries(projects).reduce((acc: Record<string, string>, [project, config]) => {
    acc[project] = typeof config.phase === 'string' && config.phase.trim()
      ? config.phase
      : 'active-dev';
    return acc;
  }, {});
}

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

  // 1a. Business priorities (manual file + Command Center urgency counts)
  try {
    signals.business_priorities = await fetchBusinessPriorities();
  } catch {
    signals.business_priorities = {
      updated: null,
      focus_projects: [],
      context: {},
      deprioritize: [],
      high_priority_counts: {},
    };
  }

  // 1b. Acceptance rates by agent (last 30 days)
  try {
    signals.acceptance_rates = await fetchAcceptanceRates();
  } catch {
    signals.acceptance_rates = {};
  }

  // 1c. Project lifecycle phases
  try {
    signals.project_phases = fetchProjectPhases();
  } catch {
    signals.project_phases = {};
  }

  // 2. Budget summaries
  try {
    if (!supabase) throw new Error('Missing Supabase credentials');
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

  // 2a. Budget alerts (threshold crossing detection)
  try {
    if (!supabase) throw new Error('Missing Supabase credentials');
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const budgetAlerts: Array<{ agent_id: string; threshold: number; pct_used: number }> = [];

    const budgetSummaries = signals.budget_summaries as Record<string, { pct_used: number; budget_monthly: number; cost_this_month: number }>;

    for (const [agentId, summary] of Object.entries(budgetSummaries)) {
      const pct = summary.pct_used || 0;

      for (const threshold of [75, 90]) {
        if (pct >= threshold) {
          // Check if alert already exists
          const { data: existing } = await supabase
            .from('agent_budget_alerts')
            .select('id')
            .eq('agent_id', agentId)
            .eq('month', currentMonth)
            .eq('threshold', threshold)
            .single();

          if (!existing) {
            await supabase.from('agent_budget_alerts').insert({
              agent_id: agentId,
              month: currentMonth,
              threshold,
              cost_at_trigger: summary.cost_this_month,
              budget_at_trigger: summary.budget_monthly,
            });
            budgetAlerts.push({ agent_id: agentId, threshold, pct_used: pct });
            console.log(`  Budget alert: ${agentId} crossed ${threshold}% (at ${pct.toFixed(1)}%)`);
          }
        }
      }
    }

    signals.budget_alerts = budgetAlerts;
  } catch (err) {
    console.error('Budget alert generation failed:', err);
    signals.budget_alerts = [];
  }

  // 2b. Auto-adjust budgets (self-learning)
  try {
    if (!supabase) throw new Error('Missing Supabase credentials');
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
    if (!supabase) throw new Error('Missing Supabase credentials');
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
    if (!supabase) throw new Error('Missing Supabase credentials');
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

  // 7. Entity cost rollup (per-entity monthly costs)
  try {
    if (!supabase) throw new Error('Missing Supabase credentials');
    const { data: entityCosts } = await supabase
      .from('entity_budget_summary')
      .select('*')
      .eq('month', new Date().toISOString().slice(0, 7));

    signals.entity_costs = (entityCosts || []).reduce((acc: Record<string, unknown>, e: Record<string, unknown>) => {
      acc[e.entity_id as string] = {
        entity_name: e.entity_name,
        total_cost: e.total_cost,
        total_runs: e.total_runs,
        total_tokens: e.total_tokens,
        agents_used: e.agents_used,
      };
      return acc;
    }, {});
  } catch {
    signals.entity_costs = {};
  }

  // 6. Active agents (for the orchestrator to reference)
  try {
    if (!supabase) throw new Error('Missing Supabase credentials');
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
  console.log(`  Business priorities: ${JSON.stringify((signals.business_priorities as Record<string, any>).focus_projects || [])}`);
  console.log(`  Acceptance rates: ${Object.keys(signals.acceptance_rates as Record<string, unknown>).length} agents`);
  console.log(`  Project phases: ${Object.keys(signals.project_phases as Record<string, unknown>).length} projects`);
  console.log(`  Budget data: ${Object.keys(signals.budget_summaries as Record<string, unknown>).length} agents`);
  console.log(`  Critical items: ${JSON.stringify(signals.critical_work_items)}`);
}

main().catch(console.error);
