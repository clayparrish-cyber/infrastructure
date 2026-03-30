/**
 * Supabase Writer Utility for Agent Infrastructure
 *
 * Provides functions for agents to write findings, log activity, and track runs
 * to Supabase. Falls back to local JSON if Supabase is unavailable.
 *
 * Usage:
 *   import { writeTaskToSupabase, logAgentActivity, startAgentRun, completeAgentRun } from './supabase-writer';
 *
 * Environment variables (from ~/.claude/.env):
 *   SUPABASE_URL - Project URL
 *   SUPABASE_SERVICE_ROLE_KEY - Service role key for writing (not anon key)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Types matching the Supabase schema
export type TaskStatus = 'pending' | 'in_progress' | 'review' | 'done';
export type TaskActionType = 'info' | 'approval' | 'decision' | 'human_task';

export interface Task {
  id?: string;
  project: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  owner?: string;
  action_type?: TaskActionType;
  metadata?: Record<string, unknown>;
  created_by: string;
  created_at?: string;
  updated_at?: string;
}

export interface AgentActivity {
  id?: string;
  agent_id: string;
  project: string;
  action: string;
  details?: Record<string, unknown>;
  created_at?: string;
}

export interface AgentRun {
  id?: string;
  agent_id: string;
  project: string;
  started_at?: string;
  completed_at?: string;
  findings_count?: number;
  status?: string;
}

// Configuration
const ENV_FILE_PATH = path.join(process.env.HOME || '', '.claude', '.env');
const FALLBACK_REPORTS_DIR = process.env.PROJECTS_DIR
  ? path.join(process.env.PROJECTS_DIR, 'agent-reports')
  : path.join(process.env.HOME || '', 'Projects', 'agent-reports');

// Cached client
let supabaseClient: SupabaseClient | null = null;
let connectionTested = false;
let connectionAvailable = false;

/**
 * Load environment variables from ~/.claude/.env
 */
function loadEnvFile(): Record<string, string> {
  const env: Record<string, string> = {};

  try {
    if (fs.existsSync(ENV_FILE_PATH)) {
      const content = fs.readFileSync(ENV_FILE_PATH, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const eqIndex = trimmed.indexOf('=');
          if (eqIndex > 0) {
            const key = trimmed.slice(0, eqIndex).trim();
            let value = trimmed.slice(eqIndex + 1).trim();
            // Remove quotes if present
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
              value = value.slice(1, -1);
            }
            env[key] = value;
          }
        }
      }
    }
  } catch (error) {
    console.warn('[supabase-writer] Could not read env file:', error);
  }

  return env;
}

/**
 * Get or create the Supabase client
 */
function getSupabaseClient(): SupabaseClient | null {
  if (supabaseClient) {
    return supabaseClient;
  }

  // Try process.env first, then fall back to file
  let url = process.env.SUPABASE_URL;
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    const fileEnv = loadEnvFile();
    url = url || fileEnv.SUPABASE_URL;
    key = key || fileEnv.SUPABASE_SERVICE_ROLE_KEY;
  }

  if (!url || !key) {
    console.warn('[supabase-writer] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return null;
  }

  supabaseClient = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  return supabaseClient;
}

/**
 * Test if Supabase connection is available
 */
async function isSupabaseAvailable(): Promise<boolean> {
  if (connectionTested) {
    return connectionAvailable;
  }

  const client = getSupabaseClient();
  if (!client) {
    connectionTested = true;
    connectionAvailable = false;
    return false;
  }

  try {
    // Simple query to test connection
    const { error } = await client.from('tasks').select('id').limit(1);
    connectionTested = true;
    connectionAvailable = !error;

    if (error) {
      console.warn('[supabase-writer] Connection test failed:', error.message);
    }

    return connectionAvailable;
  } catch (error) {
    connectionTested = true;
    connectionAvailable = false;
    console.warn('[supabase-writer] Connection test exception:', error);
    return false;
  }
}

/**
 * Get the fallback JSON file path for a project
 */
function getFallbackPath(project: string, type: 'tasks' | 'activity' | 'runs'): string {
  const projectDir = path.join(FALLBACK_REPORTS_DIR, project);
  return path.join(projectDir, `_${type}-fallback.json`);
}

/**
 * Ensure project directory exists for fallback
 */
function ensureProjectDir(project: string): void {
  const projectDir = path.join(FALLBACK_REPORTS_DIR, project);
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }
}

/**
 * Load existing fallback data
 */
function loadFallbackData<T>(filePath: string): T[] {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.warn('[supabase-writer] Could not load fallback file:', error);
  }
  return [];
}

/**
 * Save fallback data
 */
function saveFallbackData<T>(filePath: string, data: T[]): void {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('[supabase-writer] Could not save fallback file:', error);
  }
}

/**
 * Generate a simple UUID for fallback records
 */
function generateFallbackId(): string {
  return 'fb_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Write a task to Supabase
 * Falls back to local JSON if Supabase is unavailable
 *
 * @param task - Task object to write
 * @returns The created task with ID, or null on failure
 */
export async function writeTaskToSupabase(task: Task): Promise<Task | null> {
  const isAvailable = await isSupabaseAvailable();

  if (isAvailable) {
    const client = getSupabaseClient()!;

    const { data, error } = await client
      .from('tasks')
      .insert({
        project: task.project,
        title: task.title,
        description: task.description,
        status: task.status || 'pending',
        owner: task.owner,
        action_type: task.action_type || 'info',
        metadata: task.metadata || {},
        created_by: task.created_by
      })
      .select()
      .single();

    if (error) {
      console.error('[supabase-writer] Failed to write task:', error.message);
      // Fall through to fallback
    } else {
      console.log('[supabase-writer] Task written to Supabase:', data.id);
      return data as Task;
    }
  }

  // Fallback to local JSON
  console.log('[supabase-writer] Using local fallback for task');
  ensureProjectDir(task.project);
  const fallbackPath = getFallbackPath(task.project, 'tasks');
  const existing = loadFallbackData<Task>(fallbackPath);

  const newTask: Task = {
    ...task,
    id: generateFallbackId(),
    status: task.status || 'pending',
    action_type: task.action_type || 'info',
    metadata: task.metadata || {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  existing.push(newTask);
  saveFallbackData(fallbackPath, existing);

  return newTask;
}

/**
 * Log agent activity
 * Falls back to local JSON if Supabase is unavailable
 *
 * @param agentId - ID of the agent
 * @param project - Project being worked on
 * @param action - Action description (e.g., 'started_review', 'found_issue')
 * @param details - Additional details as JSON object
 * @returns The created activity record, or null on failure
 */
export async function logAgentActivity(
  agentId: string,
  project: string,
  action: string,
  details?: Record<string, unknown>
): Promise<AgentActivity | null> {
  const isAvailable = await isSupabaseAvailable();

  if (isAvailable) {
    const client = getSupabaseClient()!;

    const { data, error } = await client
      .from('agent_activity')
      .insert({
        agent_id: agentId,
        project,
        action,
        details: details || {}
      })
      .select()
      .single();

    if (error) {
      console.error('[supabase-writer] Failed to log activity:', error.message);
      // Fall through to fallback
    } else {
      return data as AgentActivity;
    }
  }

  // Fallback to local JSON
  ensureProjectDir(project);
  const fallbackPath = getFallbackPath(project, 'activity');
  const existing = loadFallbackData<AgentActivity>(fallbackPath);

  const newActivity: AgentActivity = {
    id: generateFallbackId(),
    agent_id: agentId,
    project,
    action,
    details: details || {},
    created_at: new Date().toISOString()
  };

  existing.push(newActivity);
  saveFallbackData(fallbackPath, existing);

  return newActivity;
}

/**
 * Start an agent run and record it
 * Falls back to local JSON if Supabase is unavailable
 *
 * @param agentId - ID of the agent
 * @param project - Project being reviewed
 * @returns The run ID to use when completing the run
 */
export async function startAgentRun(agentId: string, project: string): Promise<string | null> {
  const isAvailable = await isSupabaseAvailable();

  if (isAvailable) {
    const client = getSupabaseClient()!;

    const { data, error } = await client
      .from('agent_runs')
      .insert({
        agent_id: agentId,
        project,
        status: 'running'
      })
      .select()
      .single();

    if (error) {
      console.error('[supabase-writer] Failed to start run:', error.message);
      // Fall through to fallback
    } else {
      console.log('[supabase-writer] Agent run started:', data.id);
      return data.id;
    }
  }

  // Fallback to local JSON
  ensureProjectDir(project);
  const fallbackPath = getFallbackPath(project, 'runs');
  const existing = loadFallbackData<AgentRun>(fallbackPath);

  const runId = generateFallbackId();
  const newRun: AgentRun = {
    id: runId,
    agent_id: agentId,
    project,
    started_at: new Date().toISOString(),
    status: 'running',
    findings_count: 0
  };

  existing.push(newRun);
  saveFallbackData(fallbackPath, existing);

  return runId;
}

/**
 * Complete an agent run
 * Falls back to local JSON if Supabase is unavailable
 *
 * @param runId - The run ID from startAgentRun
 * @param findingsCount - Number of findings from this run
 * @returns Success boolean
 */
export async function completeAgentRun(runId: string, findingsCount: number): Promise<boolean> {
  // Check if this is a fallback ID
  if (runId.startsWith('fb_')) {
    // Handle fallback completion
    // We need to find which project this run belongs to
    const reportsDir = FALLBACK_REPORTS_DIR;

    try {
      const projects = fs.readdirSync(reportsDir);

      for (const project of projects) {
        const fallbackPath = getFallbackPath(project, 'runs');
        if (!fs.existsSync(fallbackPath)) continue;

        const runs = loadFallbackData<AgentRun>(fallbackPath);
        const runIndex = runs.findIndex(r => r.id === runId);

        if (runIndex !== -1) {
          runs[runIndex] = {
            ...runs[runIndex],
            completed_at: new Date().toISOString(),
            findings_count: findingsCount,
            status: 'completed'
          };
          saveFallbackData(fallbackPath, runs);
          console.log('[supabase-writer] Fallback run completed:', runId);
          return true;
        }
      }
    } catch (error) {
      console.error('[supabase-writer] Failed to complete fallback run:', error);
    }

    return false;
  }

  // Supabase completion
  const isAvailable = await isSupabaseAvailable();

  if (!isAvailable) {
    console.error('[supabase-writer] Cannot complete run - Supabase unavailable');
    return false;
  }

  const client = getSupabaseClient()!;

  const { error } = await client
    .from('agent_runs')
    .update({
      completed_at: new Date().toISOString(),
      findings_count: findingsCount,
      status: 'completed'
    })
    .eq('id', runId);

  if (error) {
    console.error('[supabase-writer] Failed to complete run:', error.message);
    return false;
  }

  console.log('[supabase-writer] Agent run completed:', runId);
  return true;
}

/**
 * Sync fallback data to Supabase
 * Call this when connection is restored to push any queued items
 *
 * @param project - Project to sync, or undefined for all projects
 * @returns Number of items synced
 */
export async function syncFallbackToSupabase(project?: string): Promise<number> {
  const isAvailable = await isSupabaseAvailable();

  if (!isAvailable) {
    console.warn('[supabase-writer] Cannot sync - Supabase unavailable');
    return 0;
  }

  const client = getSupabaseClient()!;
  let synced = 0;

  const projectsToSync = project
    ? [project]
    : fs.readdirSync(FALLBACK_REPORTS_DIR).filter(f =>
        fs.statSync(path.join(FALLBACK_REPORTS_DIR, f)).isDirectory()
      );

  for (const proj of projectsToSync) {
    // Sync tasks
    const tasksPath = getFallbackPath(proj, 'tasks');
    if (fs.existsSync(tasksPath)) {
      const tasks = loadFallbackData<Task>(tasksPath);
      for (const task of tasks) {
        if (task.id?.startsWith('fb_')) {
          const { error } = await client.from('tasks').insert({
            project: task.project,
            title: task.title,
            description: task.description,
            status: task.status,
            owner: task.owner,
            action_type: task.action_type,
            metadata: task.metadata,
            created_by: task.created_by,
            created_at: task.created_at,
            updated_at: task.updated_at
          });

          if (!error) synced++;
        }
      }
      // Clear synced fallback file
      if (tasks.length > 0) {
        fs.unlinkSync(tasksPath);
      }
    }

    // Sync activity
    const activityPath = getFallbackPath(proj, 'activity');
    if (fs.existsSync(activityPath)) {
      const activities = loadFallbackData<AgentActivity>(activityPath);
      for (const activity of activities) {
        if (activity.id?.startsWith('fb_')) {
          const { error } = await client.from('agent_activity').insert({
            agent_id: activity.agent_id,
            project: activity.project,
            action: activity.action,
            details: activity.details,
            created_at: activity.created_at
          });

          if (!error) synced++;
        }
      }
      if (activities.length > 0) {
        fs.unlinkSync(activityPath);
      }
    }

    // Sync runs (completed only)
    const runsPath = getFallbackPath(proj, 'runs');
    if (fs.existsSync(runsPath)) {
      const runs = loadFallbackData<AgentRun>(runsPath);
      const completedRuns = runs.filter(r => r.status === 'completed' && r.id?.startsWith('fb_'));

      for (const run of completedRuns) {
        const { error } = await client.from('agent_runs').insert({
          agent_id: run.agent_id,
          project: run.project,
          started_at: run.started_at,
          completed_at: run.completed_at,
          findings_count: run.findings_count,
          status: run.status
        });

        if (!error) synced++;
      }

      // Keep incomplete runs in fallback
      const incompleteRuns = runs.filter(r => r.status !== 'completed');
      if (incompleteRuns.length > 0) {
        saveFallbackData(runsPath, incompleteRuns);
      } else {
        fs.unlinkSync(runsPath);
      }
    }
  }

  console.log(`[supabase-writer] Synced ${synced} items to Supabase`);
  return synced;
}

/**
 * Reset connection cache (useful for testing or after config changes)
 */
export function resetConnectionCache(): void {
  supabaseClient = null;
  connectionTested = false;
  connectionAvailable = false;
}

// Export types for consumers
export type { SupabaseClient };
