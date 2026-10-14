import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import {
  CommandCenterClient,
  ReadOnlyKeyError,
  READONLY_WRITE_MESSAGE,
  resolveClientKey,
} from '../client.js';

// ---------------------------------------------------------------------------
// Read-only key fallback (2026-10-14). Codex runs sandboxed and gets only
// COMMAND_CENTER_READONLY_API_KEY. The CLI must use it when the full key is
// absent, and refuse writes with one clear line before any request is sent.
// ---------------------------------------------------------------------------

const FULL = ['COMMAND', 'CENTER', 'API', 'KEY'].join('_');
const READ = ['COMMAND', 'CENTER', 'READONLY', 'API', 'KEY'].join('_');
const MISSING_SECRET_FILE = '/nonexistent/cc-api-key-for-tests';

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) {
    saved[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  try {
    return fn();
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

test('resolveClientKey: the full key wins when both are set', () => {
  withEnv({ [FULL]: 'full_fixture', [READ]: 'read_fixture', CC_API_KEY_SECRET_FILE: MISSING_SECRET_FILE }, () => {
    assert.deepEqual(resolveClientKey(), { apiKey: 'full_fixture', readOnly: false });
  });
});

test('resolveClientKey: falls back to the read-only key when the full key is absent', () => {
  withEnv({ [FULL]: undefined, [READ]: ' read_fixture \n', CC_API_KEY_SECRET_FILE: MISSING_SECRET_FILE }, () => {
    assert.deepEqual(resolveClientKey(), { apiKey: 'read_fixture', readOnly: true });
  });
});

test('resolveClientKey: blank full key does not block the read-only fallback', () => {
  withEnv({ [FULL]: '   ', [READ]: 'read_fixture', CC_API_KEY_SECRET_FILE: MISSING_SECRET_FILE }, () => {
    assert.deepEqual(resolveClientKey(), { apiKey: 'read_fixture', readOnly: true });
  });
});

test('resolveClientKey: null when neither key is present', () => {
  withEnv({ [FULL]: undefined, [READ]: undefined, CC_API_KEY_SECRET_FILE: MISSING_SECRET_FILE }, () => {
    assert.equal(resolveClientKey(), null);
  });
});

test('read-only client: GET is sent, POST and PATCH throw before any request', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () =>
    new Response(JSON.stringify({ items: [] }), { headers: { 'Content-Type': 'application/json' } }));
  const client = new CommandCenterClient({ apiKey: 'read_fixture', baseUrl: 'https://cc.invalid', readOnly: true });

  assert.deepEqual(await client.get('/api/work-items'), { items: [] });
  assert.equal(fetchMock.mock.callCount(), 1);

  await assert.rejects(client.post('/api/work-items', {}), (err: Error) =>
    err instanceof ReadOnlyKeyError && err.message === READONLY_WRITE_MESSAGE);
  await assert.rejects(client.patch('/api/work-items', {}), ReadOnlyKeyError);
  assert.equal(fetchMock.mock.callCount(), 1, 'no write request may leave the client');
});

test('full-key client: writes are sent as before', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () =>
    new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
  const client = new CommandCenterClient({ apiKey: 'full_fixture', baseUrl: 'https://cc.invalid' });
  await client.patch('/api/work-items', {});
  assert.equal(fetchMock.mock.callCount(), 1);
});

test('cc CLI: a write with only the read-only key prints one line and exits 1', () => {
  const ccPath = join(__dirname, '..', '..', 'cc.ts');
  const env: NodeJS.ProcessEnv = { ...process.env, CC_API_KEY_SECRET_FILE: MISSING_SECRET_FILE, COMMAND_CENTER_URL: 'https://cc.invalid' };
  delete env[FULL];
  env[READ] = 'read_fixture';
  let stdout = '';
  let status = 0;
  try {
    // Full UUID, so no lookup request; the PATCH is refused in the client.
    stdout = execFileSync(process.execPath, ['--import', 'tsx', ccPath, 'wi', 'bulk-close', '10000000-0000-4000-8000-000000000001', '--notes', 'x'], {
      env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    const e = err as { status: number; stdout: string };
    status = e.status;
    stdout = e.stdout;
  }
  assert.equal(status, 1);
  // Piped stdout = agent mode: one JSON envelope line.
  const lines = stdout.trim().split('\n');
  assert.equal(lines.length, 1);
  const envelope = JSON.parse(lines[0]);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.message, READONLY_WRITE_MESSAGE);
  assert.equal(envelope.error.code, 'READ_ONLY_KEY');
});
