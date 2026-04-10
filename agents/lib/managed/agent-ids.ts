/**
 * Persistent storage for managed agent IDs and environment IDs.
 *
 * We track the (id, version, systemHash) tuple for each of the three core
 * agents (orchestrator, reviewer, worker) so the pipeline can decide when to
 * re-create an agent on the API side (hash mismatch → new definition) vs
 * reuse the existing one. The environment ID is stored separately because
 * it has a different lifecycle (one environment, many agents).
 *
 * Files live next to this module so the code review pipeline can commit
 * updated IDs as part of the migration workflow.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export interface AgentRecord {
  id: string;
  version: string;
  systemHash: string;
}

export interface AgentIdsFile {
  orchestrator?: AgentRecord;
  reviewer?: AgentRecord;
  worker?: AgentRecord;
}

interface EnvIdFile {
  envId?: string;
}

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const AGENT_IDS_PATH = join(MODULE_DIR, 'agent-ids.json');
const ENV_ID_PATH = join(MODULE_DIR, 'env-id.json');

function readJsonFile<T>(path: string): T {
  const raw = readFileSync(path, 'utf8').trim();
  if (raw === '') return {} as T;
  return JSON.parse(raw) as T;
}

function writeJsonFile(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export function loadAgentIds(): AgentIdsFile {
  return readJsonFile<AgentIdsFile>(AGENT_IDS_PATH);
}

export function saveAgentIds(ids: AgentIdsFile): void {
  writeJsonFile(AGENT_IDS_PATH, ids);
}

export function getEnvId(): string | null {
  const data = readJsonFile<EnvIdFile>(ENV_ID_PATH);
  return data.envId ?? null;
}

export function setEnvId(envId: string): void {
  writeJsonFile(ENV_ID_PATH, { envId });
}
