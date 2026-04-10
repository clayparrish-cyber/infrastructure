/**
 * Idempotent setup for the Managed Agents pipeline.
 *
 * Reads the three canonical system prompts from `./prompts/*.md`, hashes
 * each one, and creates or reuses the Anthropic environment + agent objects
 * that back the nightly review pipeline. Stored state in
 * `./agent-ids.json` + `./env-id.json` is the source of truth for "do we
 * already have an agent matching this hash?" — if yes, reuse; if hash
 * drifted, `update()` in place; if no record at all, `create()`.
 *
 * Usage:
 *   npx tsx agents/lib/managed/setup-agents.ts
 *
 * Exit codes: 0 on success, 1 on any error (stderr describes).
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type Anthropic from '@anthropic-ai/sdk';
import { getAnthropic } from './sdk.js';
import {
  type AgentIdsFile,
  type AgentRecord,
  getEnvId,
  loadAgentIds,
  saveAgentIds,
  setEnvId,
} from './agent-ids.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SetupResult {
  envId: string;
  orchestratorId: string;
  reviewerId: string;
  workerId: string;
}

type AgentKey = 'orchestrator' | 'reviewer' | 'worker';

interface DesiredAgent {
  name: string;
  model: string;
  system: string;
  tools: unknown[];
}

// Beta headers required on every managed-agents call.
// The SDK v0.87 does NOT auto-set this — must be passed explicitly.
//
// NOTE: advisor_20260301 was originally planned for reviewer/worker agents
// but the Managed Agents API rejects it with 400 — the advisor tool is only
// supported on the Messages API (`/v1/messages` with top-level `model` +
// tool in the call), not on Agent objects. Until Anthropic adds it to the
// Agents API tool whitelist, reviewer/worker run without advisor; we use
// Sonnet 4.6 solo for reviewers instead of Haiku+Opus advisor.
const BETA_HEADERS = ['managed-agents-2026-04-01'] as const;

// ---------------------------------------------------------------------------
// Prompt loading + hashing
// ---------------------------------------------------------------------------

function loadPrompt(filename: string): string {
  const url = new URL(`./prompts/${filename}`, import.meta.url);
  return readFileSync(url, 'utf8');
}

function hash(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------------------
// Environment reconciliation
// ---------------------------------------------------------------------------

function isNotFound(err: unknown): boolean {
  if (err && typeof err === 'object' && 'status' in err) {
    const status = (err as { status?: unknown }).status;
    return status === 404;
  }
  return false;
}

export async function ensureEnvironment(client: Anthropic): Promise<string> {
  const storedId = getEnvId();
  if (storedId) {
    try {
      const existing = await client.beta.environments.retrieve(storedId, {
        betas: [...BETA_HEADERS],
      });
      return existing.id;
    } catch (err) {
      if (!isNotFound(err)) throw err;
      // Fall through to create a new environment — the old one was deleted.
    }
  }

  const created = await client.beta.environments.create({
    name: 'nightly-review-env',
    config: {
      type: 'cloud',
      networking: { type: 'unrestricted' },
    },
    betas: [...BETA_HEADERS],
  });
  setEnvId(created.id);
  return created.id;
}

// ---------------------------------------------------------------------------
// Agent reconciliation
// ---------------------------------------------------------------------------

export async function ensureAgent(
  client: Anthropic,
  key: AgentKey,
  desired: DesiredAgent,
): Promise<string> {
  const systemHash = hash(desired.system);
  const stored = loadAgentIds();
  const existing = stored[key];

  if (existing && existing.systemHash === systemHash) {
    // Hash matches → no drift, reuse the existing agent.
    return existing.id;
  }

  if (existing) {
    // Hash drifted → update in place. The Managed Agents API requires the
    // current version number for optimistic concurrency; we stored it as a
    // string during the last create/update.
    const currentVersion = Number.parseInt(existing.version, 10);
    if (!Number.isFinite(currentVersion) || currentVersion < 1) {
      throw new Error(
        `Stored ${key} agent has invalid version: ${existing.version}. ` +
          `Delete the record in agent-ids.json and re-run to recreate.`,
      );
    }
    const updated = await client.beta.agents.update(existing.id, {
      version: currentVersion,
      name: desired.name,
      model: desired.model,
      system: desired.system,
      tools: desired.tools as never,
      betas: [...BETA_HEADERS],
    });
    const record: AgentRecord = {
      id: updated.id,
      version: String(updated.version),
      systemHash,
    };
    saveAgentIds({ ...stored, [key]: record });
    return updated.id;
  }

  // No record → create.
  const created = await client.beta.agents.create({
    name: desired.name,
    model: desired.model,
    system: desired.system,
    tools: desired.tools as never,
    betas: [...BETA_HEADERS],
  });
  const record: AgentRecord = {
    id: created.id,
    version: String(created.version),
    systemHash,
  };
  saveAgentIds({ ...stored, [key]: record });
  return created.id;
}

// ---------------------------------------------------------------------------
// setupAll — the main entry point
// ---------------------------------------------------------------------------

function buildDesiredAgents(): Record<AgentKey, DesiredAgent> {
  const orchestratorSystem = loadPrompt('orchestrator-system.md');
  const reviewerSystem = loadPrompt('reviewer-system.md');
  const workerSystem = loadPrompt('worker-system.md');

  // Built-in agent toolset (bash/edit/read/write/glob/grep/web_fetch/web_search)
  // is the common denominator across all three agents.
  const agentToolset = { type: 'agent_toolset_20260401' } as const;

  return {
    orchestrator: {
      name: 'Nightly Orchestrator',
      model: 'claude-opus-4-6',
      system: orchestratorSystem,
      tools: [agentToolset],
    },
    reviewer: {
      // Sonnet 4.6 solo — see BETA_HEADERS comment re advisor tool limitation.
      // Cost-neutral vs current pipeline (which also uses Sonnet defaults);
      // reliability migration is the primary win in this cutover.
      name: 'Nightly Reviewer',
      model: 'claude-sonnet-4-6',
      system: reviewerSystem,
      tools: [agentToolset],
    },
    worker: {
      name: 'Nightly Worker',
      model: 'claude-sonnet-4-6',
      system: workerSystem,
      tools: [agentToolset],
    },
  };
}

export async function setupAll(): Promise<SetupResult> {
  const client = getAnthropic();
  const envId = await ensureEnvironment(client);

  const desired = buildDesiredAgents();

  const orchestratorId = await ensureAgent(client, 'orchestrator', desired.orchestrator);
  const reviewerId = await ensureAgent(client, 'reviewer', desired.reviewer);
  const workerId = await ensureAgent(client, 'worker', desired.worker);

  return { envId, orchestratorId, reviewerId, workerId };
}

// Exported for tests that want to stub getAnthropic and call into the core.
export async function setupAllWithClient(client: Anthropic): Promise<SetupResult> {
  const envId = await ensureEnvironment(client);
  const desired = buildDesiredAgents();
  const orchestratorId = await ensureAgent(client, 'orchestrator', desired.orchestrator);
  const reviewerId = await ensureAgent(client, 'reviewer', desired.reviewer);
  const workerId = await ensureAgent(client, 'worker', desired.worker);
  return { envId, orchestratorId, reviewerId, workerId };
}

// Re-export the stored-state helpers for tests that want to reset between
// runs without reaching into `./agent-ids.js` directly.
export { loadAgentIds, saveAgentIds, getEnvId, setEnvId };
export type { AgentIdsFile, AgentRecord };

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const isCli =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`;

if (isCli) {
  setupAll()
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      process.exit(0);
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.stack || err.message : String(err);
      process.stderr.write(`setup-agents failed: ${message}\n`);
      process.exit(1);
    });
}
