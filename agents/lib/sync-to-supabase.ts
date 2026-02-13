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

async function syncProject(supabase: ReturnType<typeof createClient>, project: string, date: string) {
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
          }
        }

        // Count as synced if either insert succeeded (or was already present)
        if (!existing || !existingWorkItem) {
          synced++;
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

  const supabase = createClient(url, key, {
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
