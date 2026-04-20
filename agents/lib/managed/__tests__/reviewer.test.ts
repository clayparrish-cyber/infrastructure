import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  runReviewer,
  countCcWiCreateInvocations,
  type ReviewerClient,
} from '../reviewer.js';
import type { RosterEntry } from '../types.js';

// ---------------------------------------------------------------------------
// Fake client — identical shape to the orchestrator fake, slightly
// different canned response paths.
// ---------------------------------------------------------------------------

interface Call {
  method: string;
  args: unknown[];
}

interface FakeReviewerClient extends ReviewerClient {
  calls: Call[];
  streamEvents: unknown[];
  sessionId: string;
}

function makeFakeClient(streamEvents: unknown[] = []): FakeReviewerClient {
  const calls: Call[] = [];
  const client: FakeReviewerClient = {
    calls,
    streamEvents,
    sessionId: 'sesn_reviewer_test_001',
    beta: {
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
// Canned events helper — reviewer almost always gets a text final
// message and one model_request_end event before end_turn.
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
        input_tokens: 20_000,
        output_tokens: 3_000,
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

const ENTRY: RosterEntry = {
  agent_id: 'security-review',
  project: 'sidelineiq',
  priority: 'high',
  reason: 'auth code touched in last 24h',
};

const canonicalFinalMessage =
  'Reviewed sidelineiq for security-review. Wrote 3 findings. Done.';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('runReviewer parses findingsCount from final message', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'reviewer-test-'));
  try {
    const client = makeFakeClient(makeEndTurnSequence(canonicalFinalMessage));
    const result = await runReviewer({
      reviewerAgentId: 'agent_rev_abc',
      envId: 'env_abc',
      entry: ENTRY,
      projectRepoUrl: 'https://github.com/clayparrish-cyber/sidelineiq',
      authToken: 'ghs_faketoken',
      dryRun: false,
      client,
      buildPrompt: async () => 'CANNED_PROMPT',
      logsDir: tmp,
      nowDate: '2026-04-09',
      timeoutMs: 5_000,
    });

    assert.equal(result.findingsCount, 3);
    assert.equal(result.sessionId, 'sesn_reviewer_test_001');
    assert.equal(result.usage.executor_input_tokens, 20_000);
    assert.equal(result.usage.executor_output_tokens, 3_000);
    // Haiku: 20000/1M*$1 + 3000/1M*$5 = $0.020 + $0.015 = $0.035
    assert.ok(Math.abs(result.usage.total_cost_usd - 0.035) < 1e-9);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('runReviewer dry-run mode appends DRY RUN trailer to sent message', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'reviewer-test-'));
  try {
    const client = makeFakeClient(makeEndTurnSequence(canonicalFinalMessage));
    await runReviewer({
      reviewerAgentId: 'agent_rev_abc',
      envId: 'env_abc',
      entry: ENTRY,
      projectRepoUrl: 'https://github.com/clayparrish-cyber/sidelineiq',
      authToken: 'ghs_faketoken',
      dryRun: true,
      client,
      buildPrompt: async () => 'CANNED_PROMPT',
      logsDir: tmp,
      nowDate: '2026-04-09',
      timeoutMs: 5_000,
    });

    const send = client.calls.find((c) => c.method === 'events.send');
    assert.ok(send, 'events.send should have been called');
    const sendArgs = send.args[1] as {
      events: Array<{
        type: string;
        content: Array<{ type: string; text: string }>;
      }>;
    };
    const text = sendArgs.events[0]?.content[0]?.text ?? '';
    assert.match(text, /CANNED_PROMPT/);
    assert.match(text, /DRY RUN MODE/);
    assert.match(text, /dryrun=true/);
    assert.match(text, /dryrun-/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('runReviewer non-dry-run does NOT append DRY RUN trailer', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'reviewer-test-'));
  try {
    const client = makeFakeClient(makeEndTurnSequence(canonicalFinalMessage));
    await runReviewer({
      reviewerAgentId: 'agent_rev_abc',
      envId: 'env_abc',
      entry: ENTRY,
      projectRepoUrl: 'https://github.com/clayparrish-cyber/sidelineiq',
      authToken: 'ghs_faketoken',
      dryRun: false,
      client,
      buildPrompt: async () => 'CANNED_PROMPT',
      logsDir: tmp,
      nowDate: '2026-04-09',
      timeoutMs: 5_000,
    });

    const send = client.calls.find((c) => c.method === 'events.send');
    assert.ok(send);
    const sendArgs = send.args[1] as {
      events: Array<{
        type: string;
        content: Array<{ type: string; text: string }>;
      }>;
    };
    const text = sendArgs.events[0]?.content[0]?.text ?? '';
    assert.doesNotMatch(text, /DRY RUN MODE/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('runReviewer mounts both project and infra repos with correct paths', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'reviewer-test-'));
  try {
    const client = makeFakeClient(makeEndTurnSequence(canonicalFinalMessage));
    await runReviewer({
      reviewerAgentId: 'agent_rev_abc',
      envId: 'env_abc',
      entry: ENTRY,
      projectRepoUrl: 'https://github.com/clayparrish-cyber/sidelineiq',
      authToken: 'ghs_faketoken',
      dryRun: false,
      client,
      buildPrompt: async () => 'CANNED_PROMPT',
      logsDir: tmp,
      nowDate: '2026-04-09',
      timeoutMs: 5_000,
    });

    const create = client.calls.find((c) => c.method === 'sessions.create');
    assert.ok(create);
    const params = create.args[0] as {
      resources: Array<{
        type: string;
        url: string;
        authorization_token: string;
        mount_path: string;
      }>;
    };
    assert.equal(params.resources.length, 2);

    const project = params.resources.find(
      (r) => r.url === 'https://github.com/clayparrish-cyber/sidelineiq',
    );
    const infra = params.resources.find(
      (r) => r.url === 'https://github.com/clayparrish-cyber/infrastructure',
    );
    assert.ok(project, 'project repo should be mounted');
    assert.ok(infra, 'infra repo should be mounted');
    assert.equal(project.mount_path, '/workspace/project');
    assert.equal(infra.mount_path, '/workspace/infra');
    assert.equal(project.authorization_token, 'ghs_faketoken');
    assert.equal(infra.authorization_token, 'ghs_faketoken');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('runReviewer archives session even when the stream throws', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'reviewer-test-'));
  try {
    const client = makeFakeClient([
      { id: 'e1', type: 'session.status_running', processed_at: 't0' },
      { id: 'e2', type: 'session.status_terminated', processed_at: 't1' },
    ]);

    await assert.rejects(
      () =>
        runReviewer({
          reviewerAgentId: 'agent_rev_abc',
          envId: 'env_abc',
          entry: ENTRY,
          projectRepoUrl: 'https://github.com/clayparrish-cyber/sidelineiq',
          authToken: 'ghs_faketoken',
          dryRun: false,
          client,
          buildPrompt: async () => 'CANNED_PROMPT',
          logsDir: tmp,
          nowDate: '2026-04-09',
          timeoutMs: 5_000,
        }),
      /terminated before end_turn/,
    );

    const archives = client.calls.filter(
      (c) => c.method === 'sessions.archive',
    );
    assert.equal(archives.length, 1);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('runReviewer dumps transcript to logs/managed/{date}-{agent}-{project}-session.json', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'reviewer-test-'));
  try {
    const client = makeFakeClient(makeEndTurnSequence(canonicalFinalMessage));
    await runReviewer({
      reviewerAgentId: 'agent_rev_abc',
      envId: 'env_abc',
      entry: ENTRY,
      projectRepoUrl: 'https://github.com/clayparrish-cyber/sidelineiq',
      authToken: 'ghs_faketoken',
      dryRun: false,
      client,
      buildPrompt: async () => 'CANNED_PROMPT',
      logsDir: tmp,
      nowDate: '2026-04-09',
      timeoutMs: 5_000,
    });

    const expectedPath = join(
      tmp,
      '2026-04-09-security-review-sidelineiq-session.json',
    );
    assert.ok(existsSync(expectedPath), `expected ${expectedPath} to exist`);
    const parsed = JSON.parse(readFileSync(expectedPath, 'utf8'));
    assert.equal(parsed.length, 4);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('runReviewer parses findingsCount from loosened marker (case/punct)', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'reviewer-test-'));
  try {
    // No trailing period, capital letters, extra whitespace — original
    // strict regex would fall through; loosened regex should catch it.
    const client = makeFakeClient(
      makeEndTurnSequence('Summary: Reviewed X. wrote   7 findings today'),
    );
    const result = await runReviewer({
      reviewerAgentId: 'agent_rev_abc',
      envId: 'env_abc',
      entry: ENTRY,
      projectRepoUrl: 'https://github.com/clayparrish-cyber/sidelineiq',
      authToken: 'ghs_faketoken',
      dryRun: false,
      client,
      buildPrompt: async () => 'CANNED_PROMPT',
      logsDir: tmp,
      nowDate: '2026-04-09',
      timeoutMs: 5_000,
    });
    assert.equal(result.findingsCount, 7);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('runReviewer falls back to cc-wi-create tool-use count when marker absent', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'reviewer-test-'));
  try {
    // Simulate two real `cc wi create` bash tool uses in the session
    // transcript, with an unrelated bash call and a non-bash tool mixed
    // in. The final message has NO marker, so the fallback path runs.
    const events: unknown[] = [
      { id: 'e1', type: 'session.status_running', processed_at: 't0' },
      {
        id: 't-unrelated',
        type: 'agent.tool_use',
        name: 'bash',
        input: { command: 'ls -la' },
        processed_at: 't0.5',
      },
      {
        id: 't1',
        type: 'agent.tool_use',
        name: 'bash',
        input: {
          command:
            'npx tsx /workspace/infra/scripts/cc/cc.ts wi create --title "x"',
        },
        processed_at: 't1',
      },
      {
        id: 't2',
        type: 'agent.tool_use',
        name: 'bash',
        input: {
          command: 'cc wi create --title "y" --priority medium',
        },
        processed_at: 't1.1',
      },
      {
        id: 't-other-tool',
        type: 'agent.tool_use',
        name: 'str_replace_editor',
        input: { command: 'cc wi create in a file, not executed' },
        processed_at: 't1.2',
      },
      {
        id: 'e2',
        type: 'agent.message',
        processed_at: 't2',
        content: [{ type: 'text', text: 'Done, but did not say the marker.' }],
      },
      {
        id: 'e3',
        type: 'span.model_request_end',
        processed_at: 't3',
        is_error: false,
        model_request_start_id: 'e0',
        model_usage: {
          input_tokens: 1_000,
          output_tokens: 500,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      },
      {
        id: 'e4',
        type: 'session.status_idle',
        processed_at: 't4',
        stop_reason: { type: 'end_turn' },
      },
    ];
    const client = makeFakeClient(events);
    const result = await runReviewer({
      reviewerAgentId: 'agent_rev_abc',
      envId: 'env_abc',
      entry: ENTRY,
      projectRepoUrl: 'https://github.com/clayparrish-cyber/sidelineiq',
      authToken: 'ghs_faketoken',
      dryRun: false,
      client,
      buildPrompt: async () => 'CANNED_PROMPT',
      logsDir: tmp,
      nowDate: '2026-04-09',
      timeoutMs: 5_000,
    });
    assert.equal(result.findingsCount, 2);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('countCcWiCreateInvocations ignores non-bash tool_use and non-matching commands', () => {
  const events: unknown[] = [
    { type: 'agent.message', content: [{ type: 'text', text: 'hi' }] },
    { type: 'agent.tool_use', name: 'bash', input: { command: 'ls' } },
    { type: 'agent.tool_use', name: 'bash', input: { command: 'cc wi list' } },
    {
      type: 'agent.tool_use',
      name: 'str_replace_editor',
      input: { command: 'cc wi create not executed' },
    },
    { type: 'agent.tool_use', name: 'bash', input: { command: 'cc wi create --title z' } },
    { type: 'agent.tool_use', name: 'bash', input: { command: 'cc.ts wi create --title q' } },
  ];
  assert.equal(countCcWiCreateInvocations(events), 2);
});

test('runReviewer defaults findingsCount to 0 when marker is missing', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'reviewer-test-'));
  try {
    const client = makeFakeClient(
      makeEndTurnSequence('Agent rambled without the marker.'),
    );
    const result = await runReviewer({
      reviewerAgentId: 'agent_rev_abc',
      envId: 'env_abc',
      entry: ENTRY,
      projectRepoUrl: 'https://github.com/clayparrish-cyber/sidelineiq',
      authToken: 'ghs_faketoken',
      dryRun: false,
      client,
      buildPrompt: async () => 'CANNED_PROMPT',
      logsDir: tmp,
      nowDate: '2026-04-09',
      timeoutMs: 5_000,
    });
    assert.equal(result.findingsCount, 0);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
