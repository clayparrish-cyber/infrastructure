import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { setupAllWithClient, loadAgentIds, saveAgentIds } from '../setup-agents.js';

// Reset both JSON state files after each test so subsequent runs and git
// working tree stay clean. Matches the pattern in agent-ids.test.ts.
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

// ---------------------------------------------------------------------------
// Manual SDK spy — mimics the shape of `client.beta.environments.{retrieve,create}`
// and `client.beta.agents.{create,update}` that setup-agents.ts actually uses.
// Each method records its calls in a shared `calls` array so tests can assert
// the exact number of create/update calls per scenario.
// ---------------------------------------------------------------------------

interface SpyCall {
  method: string;
  args: unknown[];
}

interface FakeClient {
  calls: SpyCall[];
  nextEnvId: string;
  nextAgentIds: Record<string, string>; // name → id
  envShouldThrow404OnRetrieve: boolean;
  beta: {
    environments: {
      retrieve: (id: string, params?: unknown) => Promise<{ id: string }>;
      create: (params: unknown) => Promise<{ id: string }>;
    };
    agents: {
      create: (params: { name: string }) => Promise<{ id: string; version: number }>;
      update: (
        id: string,
        params: { version: number; name?: string },
      ) => Promise<{ id: string; version: number }>;
    };
  };
}

function makeFakeClient(overrides: Partial<FakeClient> = {}): FakeClient {
  const calls: SpyCall[] = [];
  const nextAgentIds: Record<string, string> = {
    'Nightly Orchestrator': 'agent_orch_001',
    'Nightly Reviewer': 'agent_rev_001',
    'Nightly Worker': 'agent_work_001',
  };
  const client: FakeClient = {
    calls,
    nextEnvId: 'env_fake_001',
    nextAgentIds,
    envShouldThrow404OnRetrieve: false,
    beta: {
      environments: {
        retrieve: async (id: string, params?: unknown) => {
          calls.push({ method: 'env.retrieve', args: [id, params] });
          if (client.envShouldThrow404OnRetrieve) {
            const err = Object.assign(new Error('not found'), { status: 404 });
            throw err;
          }
          return { id };
        },
        create: async (params: unknown) => {
          calls.push({ method: 'env.create', args: [params] });
          return { id: client.nextEnvId };
        },
      },
      agents: {
        create: async (params: { name: string }) => {
          calls.push({ method: 'agent.create', args: [params] });
          const id = client.nextAgentIds[params.name] ?? `agent_fake_${calls.length}`;
          return { id, version: 1 };
        },
        update: async (id: string, params: { version: number; name?: string }) => {
          calls.push({ method: 'agent.update', args: [id, params] });
          return { id, version: params.version + 1 };
        },
      },
    },
  };
  Object.assign(client, overrides);
  return client;
}

function countMethod(calls: SpyCall[], method: string): number {
  return calls.filter((c) => c.method === method).length;
}

// ---------------------------------------------------------------------------
// Test 1: First run — empty state creates env + all 3 agents.
// ---------------------------------------------------------------------------

test('setupAll creates env and all 3 agents on first run', async () => {
  resetFiles();
  const client = makeFakeClient();

  // Cast through unknown — we deliberately only implement the subset of the
  // SDK surface that setup-agents.ts touches.
  const result = await setupAllWithClient(client as unknown as never);

  assert.equal(result.envId, 'env_fake_001');
  assert.equal(result.orchestratorId, 'agent_orch_001');
  assert.equal(result.reviewerId, 'agent_rev_001');
  assert.equal(result.workerId, 'agent_work_001');

  assert.equal(countMethod(client.calls, 'env.retrieve'), 0, 'no prior env id → no retrieve');
  assert.equal(countMethod(client.calls, 'env.create'), 1, 'env created once');
  assert.equal(countMethod(client.calls, 'agent.create'), 3, 'three agents created');
  assert.equal(countMethod(client.calls, 'agent.update'), 0, 'no updates on first run');

  // Verify agent-ids.json + env-id.json were persisted.
  const ids = loadAgentIds();
  assert.ok(ids.orchestrator?.id === 'agent_orch_001');
  assert.ok(ids.reviewer?.id === 'agent_rev_001');
  assert.ok(ids.worker?.id === 'agent_work_001');
  assert.ok(ids.orchestrator?.systemHash.length === 16);
  assert.ok(ids.orchestrator?.version === '1');
});

// ---------------------------------------------------------------------------
// Test 2: Second run — populated state, no hash drift → all reused.
// ---------------------------------------------------------------------------

test('setupAll reuses env and all 3 agents when hashes match', async () => {
  resetFiles();

  // Seed by running once.
  const firstClient = makeFakeClient();
  await setupAllWithClient(firstClient as unknown as never);

  // Second run with a fresh client — should see zero create/update calls.
  const secondClient = makeFakeClient();
  const result = await setupAllWithClient(secondClient as unknown as never);

  assert.equal(result.envId, 'env_fake_001');
  assert.equal(result.orchestratorId, 'agent_orch_001');
  assert.equal(result.reviewerId, 'agent_rev_001');
  assert.equal(result.workerId, 'agent_work_001');

  assert.equal(countMethod(secondClient.calls, 'env.retrieve'), 1, 'env retrieved once to verify');
  assert.equal(countMethod(secondClient.calls, 'env.create'), 0, 'env not recreated');
  assert.equal(countMethod(secondClient.calls, 'agent.create'), 0, 'no agents created');
  assert.equal(countMethod(secondClient.calls, 'agent.update'), 0, 'no agents updated');
});

// ---------------------------------------------------------------------------
// Test 3: Reviewer hash drifted → update reviewer only, orchestrator + worker reused.
// ---------------------------------------------------------------------------

test('setupAll updates only the agent whose system hash drifted', async () => {
  resetFiles();

  // Seed.
  const firstClient = makeFakeClient();
  await setupAllWithClient(firstClient as unknown as never);

  // Mutate the stored reviewer hash to simulate a system-prompt change.
  const ids = loadAgentIds();
  assert.ok(ids.reviewer, 'reviewer record should exist after seed run');
  saveAgentIds({
    ...ids,
    reviewer: {
      id: ids.reviewer.id,
      version: ids.reviewer.version,
      systemHash: 'stale_hash_xxxx',
    },
  });

  const secondClient = makeFakeClient();
  const result = await setupAllWithClient(secondClient as unknown as never);

  assert.equal(result.envId, 'env_fake_001');
  assert.equal(result.orchestratorId, 'agent_orch_001');
  assert.equal(result.reviewerId, 'agent_rev_001');
  assert.equal(result.workerId, 'agent_work_001');

  assert.equal(countMethod(secondClient.calls, 'env.retrieve'), 1);
  assert.equal(countMethod(secondClient.calls, 'env.create'), 0);
  assert.equal(countMethod(secondClient.calls, 'agent.create'), 0, 'no new agents');
  assert.equal(countMethod(secondClient.calls, 'agent.update'), 1, 'reviewer updated exactly once');

  // Verify the update targeted the reviewer, not orchestrator or worker.
  const updateCall = secondClient.calls.find((c) => c.method === 'agent.update');
  assert.ok(updateCall);
  assert.equal(updateCall.args[0], 'agent_rev_001');
  const updatePayload = updateCall.args[1] as { name?: string; version: number };
  assert.equal(updatePayload.name, 'Nightly Reviewer');
  assert.equal(updatePayload.version, 1, 'update passes the stored version for OCC');

  // Stored reviewer hash should now match a real hash (16 hex chars), not stale_hash_xxxx.
  const postIds = loadAgentIds();
  assert.ok(postIds.reviewer?.systemHash !== 'stale_hash_xxxx');
  assert.equal(postIds.reviewer?.systemHash.length, 16);
  assert.equal(postIds.reviewer?.version, '2', 'update response bumps version');
});

// ---------------------------------------------------------------------------
// Test 4: Env ID stored but API returns 404 → fall through to create.
// ---------------------------------------------------------------------------

test('setupAll recreates env when stored id returns 404', async () => {
  resetFiles();

  // Seed one run to populate env-id.json.
  const firstClient = makeFakeClient();
  await setupAllWithClient(firstClient as unknown as never);

  // Second run: retrieve throws 404, so create runs and we get a new env id.
  const secondClient = makeFakeClient({
    nextEnvId: 'env_fake_002',
    envShouldThrow404OnRetrieve: true,
  });
  const result = await setupAllWithClient(secondClient as unknown as never);

  assert.equal(result.envId, 'env_fake_002', 'new env id after 404');
  assert.equal(countMethod(secondClient.calls, 'env.retrieve'), 1);
  assert.equal(countMethod(secondClient.calls, 'env.create'), 1);
});
