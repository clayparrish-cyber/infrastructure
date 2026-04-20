import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveApiKey } from '../client.js';

// ---------------------------------------------------------------------------
// resolveApiKey — 3-step precedence chain used by createClient().
//
// 1. COMMAND_CENTER_API_KEY env var (GH Actions, local dev).
// 2. File at CC_API_KEY_SECRET_FILE (test override).
// 3. File at /run/secrets/cc-api-key (Managed Agents session file mount).
//
// The Managed Agents nightly reviewer (agents/lib/managed/reviewer.ts)
// uploads the key as an ephemeral session file, which appears at the
// mount path inside the container. Before this fallback existed, all 12
// `cc wi create` attempts in GHA run 24338556554 died with
// "COMMAND_CENTER_API_KEY environment variable not set".
// ---------------------------------------------------------------------------

function withScratchKeyFile<T>(contents: string, fn: (path: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'cc-api-key-test-'));
  const path = join(dir, 'cc-api-key');
  writeFileSync(path, contents, 'utf8');
  try {
    return fn(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function withEnv<T>(
  vars: Record<string, string | undefined>,
  fn: () => T,
): T {
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

test('resolveApiKey: returns env var when set', () => {
  withEnv(
    {
      COMMAND_CENTER_API_KEY: 'env_key_value',
      CC_API_KEY_SECRET_FILE: undefined,
    },
    () => {
      assert.equal(resolveApiKey(), 'env_key_value');
    },
  );
});

test('resolveApiKey: trims whitespace from env var', () => {
  withEnv(
    {
      COMMAND_CENTER_API_KEY: '  padded_key  \n',
      CC_API_KEY_SECRET_FILE: undefined,
    },
    () => {
      assert.equal(resolveApiKey(), 'padded_key');
    },
  );
});

test('resolveApiKey: env var takes precedence over file', () => {
  withScratchKeyFile('file_key_value', (path) => {
    withEnv(
      {
        COMMAND_CENTER_API_KEY: 'env_wins',
        CC_API_KEY_SECRET_FILE: path,
      },
      () => {
        assert.equal(resolveApiKey(), 'env_wins');
      },
    );
  });
});

test('resolveApiKey: reads from file when env var is missing', () => {
  withScratchKeyFile('file_key_value', (path) => {
    withEnv(
      {
        COMMAND_CENTER_API_KEY: undefined,
        CC_API_KEY_SECRET_FILE: path,
      },
      () => {
        assert.equal(resolveApiKey(), 'file_key_value');
      },
    );
  });
});

test('resolveApiKey: trims whitespace / trailing newline from file', () => {
  withScratchKeyFile('file_key_with_newline\n', (path) => {
    withEnv(
      {
        COMMAND_CENTER_API_KEY: undefined,
        CC_API_KEY_SECRET_FILE: path,
      },
      () => {
        assert.equal(resolveApiKey(), 'file_key_with_newline');
      },
    );
  });
});

test('resolveApiKey: treats empty env var as missing, falls back to file', () => {
  withScratchKeyFile('file_key_value', (path) => {
    withEnv(
      {
        COMMAND_CENTER_API_KEY: '',
        CC_API_KEY_SECRET_FILE: path,
      },
      () => {
        assert.equal(resolveApiKey(), 'file_key_value');
      },
    );
  });
});

test('resolveApiKey: treats empty file as missing, returns null', () => {
  withScratchKeyFile('   \n  ', (path) => {
    withEnv(
      {
        COMMAND_CENTER_API_KEY: undefined,
        CC_API_KEY_SECRET_FILE: path,
      },
      () => {
        assert.equal(resolveApiKey(), null);
      },
    );
  });
});

test('resolveApiKey: returns null when nothing is set', () => {
  withEnv(
    {
      COMMAND_CENTER_API_KEY: undefined,
      CC_API_KEY_SECRET_FILE: '/nonexistent/path/nope.key',
    },
    () => {
      assert.equal(resolveApiKey(), null);
    },
  );
});

test('resolveApiKey: explicit path override wins over CC_API_KEY_SECRET_FILE env', () => {
  withScratchKeyFile('explicit_path_key', (explicitPath) => {
    withScratchKeyFile('env_path_key', (envPath) => {
      withEnv(
        {
          COMMAND_CENTER_API_KEY: undefined,
          CC_API_KEY_SECRET_FILE: envPath,
        },
        () => {
          assert.equal(resolveApiKey(explicitPath), 'explicit_path_key');
        },
      );
    });
  });
});
