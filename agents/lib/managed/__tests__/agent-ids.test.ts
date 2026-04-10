import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  loadAgentIds,
  saveAgentIds,
  getEnvId,
  setEnvId,
  type AgentIdsFile,
} from '../agent-ids.js';

// Reset files back to committed state ({}) after each test so the working
// tree stays clean and the committed files stay at their canonical empty
// state. This matches Clay's preference: tests run against the real files,
// but clean up so git diff stays empty.
const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const MANAGED_DIR = join(TEST_DIR, '..');
const AGENT_IDS_PATH = join(MANAGED_DIR, 'agent-ids.json');
const ENV_ID_PATH = join(MANAGED_DIR, 'env-id.json');

function resetFiles(): void {
  writeFileSync(AGENT_IDS_PATH, '{}\n', 'utf8');
  writeFileSync(ENV_ID_PATH, '{}\n', 'utf8');
}

afterEach(() => {
  resetFiles();
});

test('loadAgentIds returns {} on empty file', () => {
  resetFiles();
  const ids = loadAgentIds();
  assert.deepEqual(ids, {});
});

test('saveAgentIds round-trip preserves full shape', () => {
  const payload: AgentIdsFile = {
    orchestrator: {
      id: 'agent_orch_abc123',
      version: '1.0.0',
      systemHash: 'sha256:aaa',
    },
    reviewer: {
      id: 'agent_rev_def456',
      version: '1.2.3',
      systemHash: 'sha256:bbb',
    },
    worker: {
      id: 'agent_work_ghi789',
      version: '0.9.1',
      systemHash: 'sha256:ccc',
    },
  };
  saveAgentIds(payload);
  const loaded = loadAgentIds();
  assert.deepEqual(loaded, payload);
});

test('saveAgentIds with partial shape (only reviewer) round-trips', () => {
  const payload: AgentIdsFile = {
    reviewer: {
      id: 'agent_rev_only',
      version: '1.0.0',
      systemHash: 'sha256:xyz',
    },
  };
  saveAgentIds(payload);
  const loaded = loadAgentIds();
  assert.deepEqual(loaded, payload);
  assert.equal(loaded.orchestrator, undefined);
  assert.equal(loaded.worker, undefined);
});

test('getEnvId returns null on empty file', () => {
  resetFiles();
  assert.equal(getEnvId(), null);
});

test('setEnvId then getEnvId returns the value', () => {
  setEnvId('env_production_abc123');
  assert.equal(getEnvId(), 'env_production_abc123');
});

test('setEnvId overwrites a prior value', () => {
  setEnvId('env_old');
  setEnvId('env_new');
  assert.equal(getEnvId(), 'env_new');
});
