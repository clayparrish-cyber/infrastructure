import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  waitForIdle,
  dumpTranscript,
  type SessionStreamClient,
} from '../session-stream.js';

// ---------------------------------------------------------------------------
// Fake SDK — provides an async iterable of canned events, records each
// stream() call in a call log. Each test instantiates its own fake so
// there's no shared state between tests.
// ---------------------------------------------------------------------------

interface FakeClient extends SessionStreamClient {
  streamCalls: Array<{ sessionId: string; betas?: string[] }>;
}

function makeFakeClient(eventBatches: unknown[][]): FakeClient {
  const streamCalls: Array<{ sessionId: string; betas?: string[] }> = [];
  // Drain one batch per call. If called more times than batches, yield
  // nothing (which simulates the "stream closed without idle" path).
  let batchIndex = 0;
  return {
    streamCalls,
    beta: {
      sessions: {
        events: {
          stream: async (sessionId, params) => {
            streamCalls.push({
              sessionId,
              betas: params?.betas ? [...params.betas] : undefined,
            });
            const batch = eventBatches[batchIndex] ?? [];
            batchIndex += 1;
            return (async function* iter() {
              for (const ev of batch) {
                yield ev;
              }
            })();
          },
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Canned events — shaped like the real Anthropic SDK event types but only
// carry the fields the helper inspects.
// ---------------------------------------------------------------------------

const runningEvent = {
  id: 'evt_running',
  type: 'session.status_running',
  processed_at: '2026-04-09T00:00:00Z',
};

function agentMessageEvent(text: string, id = 'evt_msg') {
  return {
    id,
    type: 'agent.message',
    processed_at: '2026-04-09T00:00:01Z',
    content: [{ type: 'text', text }],
  };
}

function modelRequestEndEvent(input: number, output: number, id = 'evt_end') {
  return {
    id,
    type: 'span.model_request_end',
    processed_at: '2026-04-09T00:00:02Z',
    is_error: false,
    model_request_start_id: 'evt_start',
    model_usage: {
      input_tokens: input,
      output_tokens: output,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  };
}

function idleEndTurnEvent(id = 'evt_idle_end') {
  return {
    id,
    type: 'session.status_idle',
    processed_at: '2026-04-09T00:00:03Z',
    stop_reason: { type: 'end_turn' },
  };
}

function idleRequiresActionEvent(id = 'evt_idle_req') {
  return {
    id,
    type: 'session.status_idle',
    processed_at: '2026-04-09T00:00:01Z',
    stop_reason: { type: 'requires_action', event_ids: ['evt_tool_use'] },
  };
}

function idleRetriesExhaustedEvent(id = 'evt_idle_exh') {
  return {
    id,
    type: 'session.status_idle',
    processed_at: '2026-04-09T00:00:01Z',
    stop_reason: { type: 'retries_exhausted' },
  };
}

const terminatedEvent = {
  id: 'evt_terminated',
  type: 'session.status_terminated',
  processed_at: '2026-04-09T00:00:01Z',
};

// ---------------------------------------------------------------------------
// waitForIdle — happy path
// ---------------------------------------------------------------------------

test('waitForIdle resolves on end_turn with finalMessage + usage', async () => {
  const client = makeFakeClient([
    [
      runningEvent,
      agentMessageEvent('Hello world'),
      modelRequestEndEvent(1_000, 500),
      idleEndTurnEvent(),
    ],
  ]);

  const result = await waitForIdle(client, 'sesn_test_happy', {
    timeoutMs: 5_000,
  });

  assert.equal(result.sessionId, 'sesn_test_happy');
  assert.equal(result.finalMessage, 'Hello world');
  assert.equal(result.events.length, 4);
  assert.equal(result.usage.executor_input_tokens, 1_000);
  assert.equal(result.usage.executor_output_tokens, 500);
  // Haiku default: 1000*$1/1M + 500*$5/1M = $0.001 + $0.0025 = $0.0035
  assert.ok(Math.abs(result.usage.total_cost_usd - 0.0035) < 1e-9);
  assert.ok(result.usage.duration_ms >= 0);

  // Verify the helper passed the managed-agents beta header.
  assert.equal(client.streamCalls.length, 1);
  assert.deepEqual(client.streamCalls[0]?.betas, [
    'managed-agents-2026-04-01',
  ]);
});

// ---------------------------------------------------------------------------
// waitForIdle — requires_action then end_turn (single continuous stream)
// ---------------------------------------------------------------------------

test('waitForIdle does NOT resolve on requires_action; resolves on later end_turn', async () => {
  const client = makeFakeClient([
    [
      runningEvent,
      idleRequiresActionEvent(), // MUST not resolve
      agentMessageEvent('After tool confirmation'),
      modelRequestEndEvent(200, 100),
      idleEndTurnEvent(),
    ],
  ]);

  const result = await waitForIdle(client, 'sesn_test_req_act', {
    timeoutMs: 5_000,
  });

  assert.equal(result.finalMessage, 'After tool confirmation');
  assert.equal(result.usage.executor_input_tokens, 200);
  // All 5 events must be captured, not just the ones after requires_action.
  assert.equal(result.events.length, 5);
});

// ---------------------------------------------------------------------------
// waitForIdle — terminated rejects
// ---------------------------------------------------------------------------

test('waitForIdle rejects on session.status_terminated with descriptive error', async () => {
  const client = makeFakeClient([[runningEvent, terminatedEvent]]);

  await assert.rejects(
    () => waitForIdle(client, 'sesn_test_term', { timeoutMs: 5_000 }),
    /terminated before end_turn/,
  );
});

// ---------------------------------------------------------------------------
// waitForIdle — retries_exhausted rejects
// ---------------------------------------------------------------------------

test('waitForIdle rejects on retries_exhausted', async () => {
  const client = makeFakeClient([[runningEvent, idleRetriesExhaustedEvent()]]);

  await assert.rejects(
    () => waitForIdle(client, 'sesn_test_retries', { timeoutMs: 5_000 }),
    /exhausted its retry budget/,
  );
});

// ---------------------------------------------------------------------------
// waitForIdle — final message is ONLY the last agent.message
// ---------------------------------------------------------------------------

test('finalMessage reflects only the most recent agent.message', async () => {
  const client = makeFakeClient([
    [
      runningEvent,
      agentMessageEvent('First draft'),
      modelRequestEndEvent(100, 50),
      agentMessageEvent('Final answer'),
      modelRequestEndEvent(100, 50),
      idleEndTurnEvent(),
    ],
  ]);

  const result = await waitForIdle(client, 'sesn_test_multi_msg', {
    timeoutMs: 5_000,
  });

  assert.equal(result.finalMessage, 'Final answer');
  // Usage accumulates from both model_request_end events.
  assert.equal(result.usage.executor_input_tokens, 200);
  assert.equal(result.usage.executor_output_tokens, 100);
});

// ---------------------------------------------------------------------------
// dumpTranscript — round-trip
// ---------------------------------------------------------------------------

test('dumpTranscript writes JSON that round-trips exactly', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'session-stream-test-'));
  try {
    const filePath = join(tmpDir, 'nested', 'dir', 'transcript.json');
    const original = [
      { id: 'evt_1', type: 'session.status_running' },
      {
        id: 'evt_2',
        type: 'agent.message',
        content: [{ type: 'text', text: 'hi' }],
      },
      { id: 'evt_3', type: 'session.status_idle', stop_reason: { type: 'end_turn' } },
    ];

    dumpTranscript(original, filePath);

    assert.ok(existsSync(filePath), 'transcript file should exist');
    const roundTripped = JSON.parse(readFileSync(filePath, 'utf8'));
    assert.deepEqual(roundTripped, original);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
