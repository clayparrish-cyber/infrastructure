import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getEnv } from '../env.js';

// Track env vars we mutate so we can restore them cleanly. We snapshot the
// original values of ANY key we touch; afterEach restores them byte-for-byte.
// getEnv() reads process.env at call time (not memoized), so a static import
// works — the dynamic import pattern would cache anyway.
const TOUCHED_KEYS = [
  'ANTHROPIC_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'COMMAND_CENTER_API_KEY',
  'GH_APP_ID',
  'GH_APP_PRIVATE_KEY',
  'MANAGED_AGENTS_CONCURRENCY',
  'MANAGED_AGENTS_MAX_SPEND_USD',
  'SESSION_TIMEOUT_SEC',
] as const;

let snapshot: Record<string, string | undefined> = {};

function setMinimalValidEnv(): void {
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  process.env.COMMAND_CENTER_API_KEY = 'cc-test-key';
}

beforeEach(() => {
  snapshot = {};
  for (const key of TOUCHED_KEYS) {
    snapshot[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of TOUCHED_KEYS) {
    if (snapshot[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = snapshot[key];
    }
  }
});

test('getEnv returns populated frozen object with defaults when only required vars are set', () => {
  setMinimalValidEnv();
  const env = getEnv();

  assert.equal(env.ANTHROPIC_API_KEY, 'sk-ant-test');
  assert.equal(env.SUPABASE_URL, 'https://test.supabase.co');
  assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, 'test-service-role-key');
  assert.equal(env.COMMAND_CENTER_API_KEY, 'cc-test-key');
  assert.equal(env.MANAGED_AGENTS_CONCURRENCY, 8);
  assert.equal(env.MANAGED_AGENTS_MAX_SPEND_USD, 20);
  assert.equal(env.SESSION_TIMEOUT_SEC, 1200);
  assert.equal(env.GH_APP_ID, undefined);
  assert.equal(env.GH_APP_PRIVATE_KEY, undefined);
  assert.ok(Object.isFrozen(env), 'env should be frozen');
});

test('getEnv throws when ANTHROPIC_API_KEY is missing', () => {
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  process.env.COMMAND_CENTER_API_KEY = 'cc-test-key';
  // ANTHROPIC_API_KEY deliberately absent

  assert.throws(() => getEnv(), /ANTHROPIC_API_KEY/);
});

test('getEnv parses custom numeric vars correctly', () => {
  setMinimalValidEnv();
  process.env.MANAGED_AGENTS_CONCURRENCY = '16';
  process.env.MANAGED_AGENTS_MAX_SPEND_USD = '50';
  process.env.SESSION_TIMEOUT_SEC = '3600';
  process.env.GH_APP_ID = '12345';
  process.env.GH_APP_PRIVATE_KEY = 'base64-pem-data';

  const env = getEnv();

  assert.equal(env.MANAGED_AGENTS_CONCURRENCY, 16);
  assert.equal(env.MANAGED_AGENTS_MAX_SPEND_USD, 50);
  assert.equal(env.SESSION_TIMEOUT_SEC, 3600);
  assert.equal(env.GH_APP_ID, '12345');
  assert.equal(env.GH_APP_PRIVATE_KEY, 'base64-pem-data');
});

test('getEnv falls back to defaults on NaN numeric vars', () => {
  setMinimalValidEnv();
  process.env.MANAGED_AGENTS_CONCURRENCY = 'not-a-number';
  process.env.SESSION_TIMEOUT_SEC = '';

  const env = getEnv();

  assert.equal(env.MANAGED_AGENTS_CONCURRENCY, 8);
  assert.equal(env.SESSION_TIMEOUT_SEC, 1200);
});

test('getEnv throws when SUPABASE_URL is missing and names it', () => {
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
  process.env.COMMAND_CENTER_API_KEY = 'cc-test';

  assert.throws(() => getEnv(), /SUPABASE_URL/);
});
