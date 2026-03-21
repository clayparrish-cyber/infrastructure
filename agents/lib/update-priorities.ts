#!/usr/bin/env npx tsx
/**
 * Update business priorities from Command Center work-item urgency.
 *
 * Usage: npx tsx update-priorities.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = path.resolve(SCRIPT_DIR, '..');
const DEFAULT_REGISTRY_PATH = path.join(AGENTS_DIR, 'registry.json');
const DEFAULT_PRIORITIES_PATH = path.join(AGENTS_DIR, 'priorities.json');
const OPEN_WORK_ITEM_STATUSES = ['discovered', 'triaged', 'approved', 'in_progress', 'review'];

type PrioritiesFile = {
  updated?: string;
  focus_projects?: string[];
  context?: Record<string, string>;
  deprioritize?: string[];
};

function loadEnv(): Record<string, string> {
  const envPath = path.join(process.env.HOME || '', '.claude', '.env');
  const env: Record<string, string> = {};

  if (!fs.existsSync(envPath)) {
    return env;
  }

  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }

  return env;
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

function normalizePrioritiesFile(value: PrioritiesFile | null | undefined): Required<PrioritiesFile> {
  return {
    updated: typeof value?.updated === 'string' ? value.updated : '',
    focus_projects: Array.isArray(value?.focus_projects) ? value.focus_projects : [],
    context: value?.context && typeof value.context === 'object' ? value.context : {},
    deprioritize: Array.isArray(value?.deprioritize) ? value.deprioritize : [],
  };
}

function readProjectSlugs(registryPath: string): string[] {
  const registry = readJsonFile<{ projects?: Record<string, unknown> }>(registryPath, {});
  return Object.keys(registry.projects || {});
}

async function fetchOpenHighPriorityCounts(
  commandCenterUrl: string,
  commandCenterApiKey: string,
  projects: string[],
): Promise<Record<string, number>> {
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

function buildFocusProjects(counts: Record<string, number>, deprioritize: string[]): string[] {
  const deprioritized = new Set(deprioritize);

  return Object.entries(counts)
    .filter(([project, count]) => count >= 3 && !deprioritized.has(project))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([project]) => project);
}

function writePrioritiesFile(filePath: string, priorities: Required<PrioritiesFile>) {
  fs.writeFileSync(filePath, `${JSON.stringify(priorities, null, 2)}\n`);
}

async function main() {
  const env = loadEnv();
  const commandCenterUrl = process.env.COMMAND_CENTER_URL || env.COMMAND_CENTER_URL;
  const commandCenterApiKey = process.env.COMMAND_CENTER_API_KEY || env.COMMAND_CENTER_API_KEY;
  const registryPath = process.env.REGISTRY_PATH || DEFAULT_REGISTRY_PATH;
  const prioritiesPath = process.env.PRIORITIES_PATH || DEFAULT_PRIORITIES_PATH;

  if (!commandCenterUrl || !commandCenterApiKey) {
    console.log('Command Center credentials missing; skipping priorities update.');
    process.exit(0);
  }

  const current = normalizePrioritiesFile(readJsonFile<PrioritiesFile>(prioritiesPath, {}));
  const projects = readProjectSlugs(registryPath);
  const counts = await fetchOpenHighPriorityCounts(commandCenterUrl, commandCenterApiKey, projects);
  const focusProjects = buildFocusProjects(counts, current.deprioritize);

  const nextCore = {
    focus_projects: focusProjects,
    context: current.context,
    deprioritize: current.deprioritize,
  };
  const currentCore = {
    focus_projects: current.focus_projects,
    context: current.context,
    deprioritize: current.deprioritize,
  };

  if (JSON.stringify(currentCore) === JSON.stringify(nextCore)) {
    console.log(`No priorities change. Focus projects: ${focusProjects.join(', ') || '(none)'}`);
    process.exit(0);
  }

  const next: Required<PrioritiesFile> = {
    updated: new Date().toISOString().slice(0, 10),
    ...nextCore,
  };

  writePrioritiesFile(prioritiesPath, next);
  console.log(`Updated ${prioritiesPath}`);
  console.log(`  Focus projects: ${focusProjects.join(', ') || '(none)'}`);
  console.log(`  Counts: ${JSON.stringify(counts)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
