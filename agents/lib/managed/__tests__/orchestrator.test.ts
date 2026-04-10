import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runOrchestrator, type OrchestratorClient } from '../orchestrator.js';

// ---------------------------------------------------------------------------
// Fake client — records every call and provides canned stream events.
// ---------------------------------------------------------------------------

interface Call {
  method: string;
  args: unknown[];
}

interface FakeOrchestratorClient extends OrchestratorClient {
  calls: Call[];
  /** Events to emit from stream(). Set by each test. */
  streamEvents: unknown[];
  /** Session ID the fake hands back from create(). */
  sessionId: string;
  /** File ID the fake hands back from files.upload(). */
  fileId: string;
}

function makeFakeClient(streamEvents: unknown[] = []): FakeOrchestratorClient {
  const calls: Call[] = [];
  const client: FakeOrchestratorClient = {
    calls,
    streamEvents,
    sessionId: 'sesn_orch_test_001',
    fileId: 'file_orch_test_001',
    beta: {
      files: {
        upload: async (params, options) => {
          calls.push({ method: 'files.upload', args: [params, options] });
          return { id: client.fileId };
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

// ---------------------------------------------------------------------------
// Canned event sequences
// ---------------------------------------------------------------------------

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
        input_tokens: 500,
        output_tokens: 200,
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

const VALID_ROSTER_JSON = JSON.stringify({
  roster: [
    {
      agent_id: 'security-review',
      project: 'sidelineiq',
      priority: 'high',
      reason: 'Changed auth code in last 24h',
    },
  ],
  skipped: [],
  signals_summary: 'SidelineIQ security review due',
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('runOrchestrator returns parsed Roster on happy path', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'orch-test-'));
  try {
    const client = makeFakeClient(makeEndTurnSequence(VALID_ROSTER_JSON));
    const roster = await runOrchestrator(
      'agent_orch_abc',
      'env_abc',
      '{"foo":"bar"}',
      { client, logsDir: tmp, nowDate: '2026-04-09' },
    );

    assert.equal(roster.roster.length, 1);
    assert.equal(roster.roster[0]?.project, 'sidelineiq');
    assert.equal(roster.roster[0]?.agent_id, 'security-review');
    assert.equal(roster.skipped.length, 0);

    // Archive called in finally.
    const archiveCalls = client.calls.filter(
      (c) => c.method === 'sessions.archive',
    );
    assert.equal(archiveCalls.length, 1);
    assert.equal(archiveCalls[0]?.args[0], 'sesn_orch_test_001');

    // Transcript dumped with the expected filename.
    const transcriptPath = join(
      tmp,
      '2026-04-09-orchestrator-session.json',
    );
    assert.ok(existsSync(transcriptPath));
    const parsed = JSON.parse(readFileSync(transcriptPath, 'utf8'));
    assert.equal(parsed.length, 4);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('runOrchestrator opens stream before sending the user message', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'orch-test-'));
  try {
    const client = makeFakeClient(makeEndTurnSequence(VALID_ROSTER_JSON));
    await runOrchestrator(
      'agent_orch_abc',
      'env_abc',
      '{"foo":"bar"}',
      { client, logsDir: tmp, nowDate: '2026-04-09' },
    );

    // Find the indices of stream and send; stream must come first.
    const streamIdx = client.calls.findIndex(
      (c) => c.method === 'events.stream',
    );
    const sendIdx = client.calls.findIndex((c) => c.method === 'events.send');
    assert.ok(streamIdx >= 0, 'stream should have been called');
    assert.ok(sendIdx >= 0, 'send should have been called');
    assert.ok(
      streamIdx < sendIdx,
      `stream (idx ${streamIdx}) must come before send (idx ${sendIdx})`,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('runOrchestrator throws on invalid JSON with preview of final message', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'orch-test-'));
  try {
    const bogus = 'Not JSON at all — the LLM went off script and wrote prose instead.';
    const client = makeFakeClient(makeEndTurnSequence(bogus));

    await assert.rejects(
      () =>
        runOrchestrator('agent_orch_abc', 'env_abc', '{}', {
          client,
          logsDir: tmp,
          nowDate: '2026-04-09',
        }),
      (err: Error) => {
        assert.match(err.message, /not strict JSON/);
        assert.match(err.message, /Not JSON at all/);
        return true;
      },
    );

    // Archive still called despite the parse failure.
    const archiveCalls = client.calls.filter(
      (c) => c.method === 'sessions.archive',
    );
    assert.equal(archiveCalls.length, 1);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('runOrchestrator archives session even when the stream throws terminated', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'orch-test-'));
  try {
    const client = makeFakeClient([
      { id: 'e1', type: 'session.status_running', processed_at: 't0' },
      { id: 'e2', type: 'session.status_terminated', processed_at: 't1' },
    ]);

    await assert.rejects(
      () =>
        runOrchestrator('agent_orch_abc', 'env_abc', '{}', {
          client,
          logsDir: tmp,
          nowDate: '2026-04-09',
        }),
      /terminated before end_turn/,
    );

    const archiveCalls = client.calls.filter(
      (c) => c.method === 'sessions.archive',
    );
    assert.equal(archiveCalls.length, 1);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('runOrchestrator uploads signals.json as a file and mounts it at the expected path', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'orch-test-'));
  try {
    const client = makeFakeClient(makeEndTurnSequence(VALID_ROSTER_JSON));
    await runOrchestrator(
      'agent_orch_abc',
      'env_abc',
      '{"foo":"bar"}',
      { client, logsDir: tmp, nowDate: '2026-04-09' },
    );

    const upload = client.calls.find((c) => c.method === 'files.upload');
    assert.ok(upload, 'files.upload should have been called');

    const create = client.calls.find((c) => c.method === 'sessions.create');
    assert.ok(create, 'sessions.create should have been called');
    const createParams = create.args[0] as {
      resources: Array<{
        type: string;
        file_id: string;
        mount_path: string;
      }>;
      agent: string;
      environment_id: string;
    };
    assert.equal(createParams.agent, 'agent_orch_abc');
    assert.equal(createParams.environment_id, 'env_abc');
    assert.equal(createParams.resources.length, 1);
    assert.equal(createParams.resources[0]?.type, 'file');
    assert.equal(createParams.resources[0]?.file_id, 'file_orch_test_001');
    assert.equal(
      createParams.resources[0]?.mount_path,
      '/workspace/signals.json',
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
