import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  loadAgentIds,
  saveAgentIds,
  getEnvId,
  setEnvId,
  type AgentIdsFile,
} from '../agent-ids.js';

// These tests exercise the real agent-ids.json and env-id.json files next
// to the module under test (the module pins the paths via import.meta.url,
// so there is no path-override hook we could use without changing the
// production shape). To keep git diff clean and avoid clobbering the
// committed state, snapshot the original contents ONCE before any test
// runs, and restore them after each test (and again after all tests, as a
// belt-and-suspenders guard if the process is killed mid-run).
//
// Prior to 2026-04-20 this file hard-reset both files to `{}` in
// afterEach, which wiped committed agent IDs whenever a developer ran the
// test suite from a clean checkout. See CC work item 33cd84cb.

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const MANAGED_DIR = join(TEST_DIR, '..');
const AGENT_IDS_PATH = join(MANAGED_DIR, 'agent-ids.json');
const ENV_ID_PATH = join(MANAGED_DIR, 'env-id.json');

interface Snapshot {
  existed: boolean;
  contents: string;
}

function snapshot(path: string): Snapshot {
  if (!existsSync(path)) return { existed: false, contents: '' };
  return { existed: true, contents: readFileSync(path, 'utf8') };
}

function restore(path: string, snap: Snapshot): void {
  if (snap.existed) {
    writeFileSync(path, snap.contents, 'utf8');
  } else {
    // If a test created the file from nothing, reset to `{}` rather than
    // deleting — these files are part of the committed surface and the
    // module under test expects them to exist.
    writeFileSync(path, '{}\n', 'utf8');
  }
}

function emptyFiles(): void {
  writeFileSync(AGENT_IDS_PATH, '{}\n', 'utf8');
  writeFileSync(ENV_ID_PATH, '{}\n', 'utf8');
}

let agentIdsSnapshot: Snapshot;
let envIdSnapshot: Snapshot;

before(() => {
  agentIdsSnapshot = snapshot(AGENT_IDS_PATH);
  envIdSnapshot = snapshot(ENV_ID_PATH);
});

beforeEach(() => {
  // Start every test from a known-empty state so assertions are
  // independent of whatever committed agent IDs happen to be on disk.
  // The `after` hooks restore the original snapshot — these are safe to
  // clobber within the test.
  emptyFiles();
});

afterEach(() => {
  // Belt-and-suspenders: keep the files at `{}` between tests. The real
  // restore (back to committed contents) happens in the single after()
  // hook below, outside try/finally in the interpreter loop.
  try {
    emptyFiles();
  } catch {
    // swallow — after() handles the final restore
  }
});

after(() => {
  // Final restore — guaranteed to run regardless of test outcomes.
  try {
    restore(AGENT_IDS_PATH, agentIdsSnapshot);
  } finally {
    restore(ENV_ID_PATH, envIdSnapshot);
  }
});

test('loadAgentIds returns {} on empty file', () => {
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
