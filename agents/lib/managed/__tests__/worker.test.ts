import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  runWorker,
  GITHUB_TOKEN_MOUNT_PATH,
  type WorkerClient,
} from '../worker.js';

// ---------------------------------------------------------------------------
// Fake client
// ---------------------------------------------------------------------------

interface Call {
  method: string;
  args: unknown[];
}

interface FakeWorkerClient extends WorkerClient {
  calls: Call[];
  streamEvents: unknown[];
  sessionId: string;
}

function makeFakeClient(streamEvents: unknown[] = []): FakeWorkerClient {
  const calls: Call[] = [];
  const client: FakeWorkerClient = {
    calls,
    streamEvents,
    sessionId: 'sesn_worker_test_001',
    beta: {
      files: {
        upload: async (params, options) => {
          calls.push({ method: 'files.upload', args: [params, options] });
          return { id: 'file_token_stub_001' };
        },
      },
      sessions: {
        create: async (params) => {
          calls.push({ method: 'sessions.create', args: [params] });
          return { id: client.sessionId };
        },
        archive: async (id, params) => {
          calls.push({ method: 'sessions.archive', args: [id, params] });
          return { id };
        },
        events: {
          stream: async (id, params) => {
            calls.push({ method: 'events.stream', args: [id, params] });
            const events = client.streamEvents;
            return (async function* iter() {
              for (const ev of events) {
                yield ev;
              }
            })();
          },
          send: async (id, params) => {
            calls.push({ method: 'events.send', args: [id, params] });
            return { data: [] };
          },
        },
      },
    },
  };
  return client;
}

function makeEndTurnSequence(finalText: string): unknown[] {
  return [
    { id: 'e1', type: 'session.status_running', processed_at: 't0' },
    {
      id: 'e2',
      type: 'agent.message',
      processed_at: 't1',
      content: [{ type: 'text', text: finalText }],
    },
    {
      id: 'e3',
      type: 'span.model_request_end',
      processed_at: 't2',
      is_error: false,
      model_request_start_id: 'e0',
      model_usage: {
        input_tokens: 10_000,
        output_tokens: 2_000,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    },
    {
      id: 'e4',
      type: 'session.status_idle',
      processed_at: 't3',
      stop_reason: { type: 'end_turn' },
    },
  ];
}

const WORK_ITEM = {
  id: 'wi_abc123',
  title: 'Add CSRF token to /api/checkout',
  description:
    'The POST /api/checkout endpoint accepts requests without CSRF verification. Add double-submit cookie pattern.',
};

const BASE_OPTS = {
  workerAgentId: 'agent_work_abc',
  envId: 'env_abc',
  workItem: WORK_ITEM,
  projectRepoUrl: 'https://github.com/clayparrish-cyber/sidelineiq',
  authToken: 'ghs_faketoken',
  nowDate: '2026-04-09',
  timeoutMs: 5_000,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('runWorker returns done with branch + pr_url on happy path', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'worker-test-'));
  try {
    const finalText =
      'Implemented CSRF protection. Branch pushed and PR opened.\n' +
      '===BRANCH_NAME_START===fix/csrf-checkout===BRANCH_NAME_END===\n' +
      '===PR_URL_START===https://github.com/clayparrish-cyber/sidelineiq/pull/42===PR_URL_END===';
    const client = makeFakeClient(makeEndTurnSequence(finalText));

    const result = await runWorker({ ...BASE_OPTS, client, logsDir: tmp });

    assert.equal(result.status, 'done');
    if (result.status !== 'done') return; // narrow for TS
    assert.equal(result.branch, 'fix/csrf-checkout');
    assert.equal(
      result.pr_url,
      'https://github.com/clayparrish-cyber/sidelineiq/pull/42',
    );
    assert.equal(result.session_id, 'sesn_worker_test_001');

    const archives = client.calls.filter(
      (c) => c.method === 'sessions.archive',
    );
    assert.equal(archives.length, 1);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('runWorker returns human-action when marker present', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'worker-test-'));
  try {
    const finalText =
      'I cannot safely modify the payment flow without a live test account.\n' +
      '===HUMAN_ACTION_REQUIRED===';
    const client = makeFakeClient(makeEndTurnSequence(finalText));

    const result = await runWorker({ ...BASE_OPTS, client, logsDir: tmp });

    assert.equal(result.status, 'human-action');
    assert.equal(result.branch, null);
    assert.equal(result.pr_url, null);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('runWorker returns already-resolved when marker present', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'worker-test-'));
  try {
    const finalText =
      'Checked main branch — this finding has already been addressed in commit abc123.\n' +
      '===ALREADY_RESOLVED===';
    const client = makeFakeClient(makeEndTurnSequence(finalText));

    const result = await runWorker({ ...BASE_OPTS, client, logsDir: tmp });

    assert.equal(result.status, 'already-resolved');
    assert.equal(result.branch, null);
    assert.equal(result.pr_url, null);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('runWorker throws when branch present but PR URL missing', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'worker-test-'));
  try {
    const finalText =
      'Made the edit and pushed the branch, but could not reach the GitHub API.\n' +
      '===BRANCH_NAME_START===fix/partial===BRANCH_NAME_END===';
    const client = makeFakeClient(makeEndTurnSequence(finalText));

    await assert.rejects(
      () => runWorker({ ...BASE_OPTS, client, logsDir: tmp }),
      /branch name but no PR URL/,
    );

    // Archive still called in finally.
    const archives = client.calls.filter(
      (c) => c.method === 'sessions.archive',
    );
    assert.equal(archives.length, 1);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('runWorker throws when no terminal markers are emitted at all', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'worker-test-'));
  try {
    const finalText = 'I rambled about the codebase but never declared done.';
    const client = makeFakeClient(makeEndTurnSequence(finalText));

    await assert.rejects(
      () => runWorker({ ...BASE_OPTS, client, logsDir: tmp }),
      /did not emit BRANCH_NAME markers/,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('runWorker keeps the GitHub token OUT of the user message body', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'worker-test-'));
  try {
    const finalText =
      '===BRANCH_NAME_START===fix/x===BRANCH_NAME_END===\n' +
      '===PR_URL_START===https://github.com/foo/bar/pull/1===PR_URL_END===';
    const client = makeFakeClient(makeEndTurnSequence(finalText));

    await runWorker({ ...BASE_OPTS, client, logsDir: tmp });

    const send = client.calls.find((c) => c.method === 'events.send');
    assert.ok(send);
    const sendArgs = send.args[1] as {
      events: Array<{
        type: string;
        content: Array<{ type: string; text: string }>;
      }>;
    };
    const text = sendArgs.events[0]?.content[0]?.text ?? '';
    // Token MUST NOT appear in the user message body.
    assert.doesNotMatch(text, /ghs_faketoken/);
    assert.doesNotMatch(text, /GITHUB_TOKEN_START/);
    // But the work item shape and the instruction to read the token from
    // the mounted file path must still be present.
    assert.match(text, /Work item: Add CSRF token to \/api\/checkout/);
    assert.match(text, new RegExp(GITHUB_TOKEN_MOUNT_PATH.replace(/\//g, '\\/')));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('runWorker uploads the GitHub token as a file and mounts it', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'worker-test-'));
  try {
    const finalText =
      '===BRANCH_NAME_START===fix/x===BRANCH_NAME_END===\n' +
      '===PR_URL_START===https://github.com/foo/bar/pull/1===PR_URL_END===';
    const client = makeFakeClient(makeEndTurnSequence(finalText));

    await runWorker({ ...BASE_OPTS, client, logsDir: tmp });

    // files.upload must be called exactly once, with the token as the
    // file body (so the session container reads the token from the
    // mounted file rather than the message context).
    const uploads = client.calls.filter((c) => c.method === 'files.upload');
    assert.equal(uploads.length, 1);
    const uploadArgs = uploads[0]?.args[0] as { file: File };
    assert.ok(uploadArgs.file instanceof File);
    const tokenBody = await uploadArgs.file.text();
    assert.equal(tokenBody, 'ghs_faketoken');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('runWorker mounts project repo + token file with correct shapes', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'worker-test-'));
  try {
    const finalText =
      '===BRANCH_NAME_START===fix/x===BRANCH_NAME_END===\n' +
      '===PR_URL_START===https://github.com/foo/bar/pull/1===PR_URL_END===';
    const client = makeFakeClient(makeEndTurnSequence(finalText));

    await runWorker({ ...BASE_OPTS, client, logsDir: tmp });

    const create = client.calls.find((c) => c.method === 'sessions.create');
    assert.ok(create);
    const params = create.args[0] as {
      resources: Array<{
        type: string;
        url?: string;
        file_id?: string;
        authorization_token?: string;
        mount_path: string;
      }>;
    };
    assert.equal(params.resources.length, 2);

    const repo = params.resources.find((r) => r.type === 'github_repository');
    assert.ok(repo, 'project repo should be mounted');
    assert.equal(repo.url, 'https://github.com/clayparrish-cyber/sidelineiq');
    assert.equal(repo.authorization_token, 'ghs_faketoken');
    assert.equal(repo.mount_path, '/workspace/project');

    const tokenFile = params.resources.find((r) => r.type === 'file');
    assert.ok(tokenFile, 'token file should be mounted');
    assert.equal(tokenFile.file_id, 'file_token_stub_001');
    assert.equal(tokenFile.mount_path, GITHUB_TOKEN_MOUNT_PATH);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
