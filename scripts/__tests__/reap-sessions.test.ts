import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  reapSessions,
  type ReaperClient,
  type ReaperSession,
} from '../reap-sessions.js';

// ---------------------------------------------------------------------------
// Fake client — implements the narrow ReaperClient shape used by reapSessions.
// ---------------------------------------------------------------------------

interface Call {
  name: string;
  args: unknown[];
}

function makeFakeClient(pages: ReaperSession[][]): {
  client: ReaperClient;
  calls: Call[];
} {
  const calls: Call[] = [];
  const client: ReaperClient = {
    beta: {
      sessions: {
        list: async (params) => {
          calls.push({ name: 'list', args: [params] });
          // Flatten all pages into a single async iterator.
          return (async function* iter() {
            for (const page of pages) {
              for (const s of page) yield s;
            }
          })();
        },
        archive: async (sessionId, params) => {
          calls.push({ name: 'archive', args: [sessionId, params] });
          return { id: sessionId };
        },
      },
    },
  };
  return { client, calls };
}

function iso(offsetMs: number, nowMs: number): string {
  return new Date(nowMs + offsetMs).toISOString();
}

const NOW = Date.UTC(2026, 3, 9, 12, 0, 0); // 2026-04-09T12:00:00Z

const freshSession: ReaperSession = {
  id: 'sesn_fresh',
  status: 'idle',
  created_at: iso(-30 * 60 * 1000, NOW), // 30 min old
};

const staleIdleSession: ReaperSession = {
  id: 'sesn_stale_idle',
  status: 'idle',
  created_at: iso(-3 * 60 * 60 * 1000, NOW), // 3h old
};

const staleRunningSession: ReaperSession = {
  id: 'sesn_stale_running',
  status: 'running',
  created_at: iso(-4 * 60 * 60 * 1000, NOW), // 4h old
};

const terminatedSession: ReaperSession = {
  id: 'sesn_terminated',
  status: 'terminated',
  created_at: iso(-3 * 60 * 60 * 1000, NOW),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('fresh session (< 2h) is not archived', async () => {
  const { client, calls } = makeFakeClient([[freshSession]]);
  const result = await reapSessions({
    client,
    now: () => NOW,
    dryRun: false,
  });
  assert.equal(result.archived.length, 0);
  assert.equal(calls.filter((c) => c.name === 'archive').length, 0);
});

test('stale idle session (> 2h) is archived', async () => {
  const { client, calls } = makeFakeClient([[staleIdleSession]]);
  const result = await reapSessions({
    client,
    now: () => NOW,
    dryRun: false,
  });
  assert.equal(result.archived.length, 1);
  assert.equal(result.archived[0]?.id, 'sesn_stale_idle');
  const archives = calls.filter((c) => c.name === 'archive');
  assert.equal(archives.length, 1);
  assert.equal(archives[0]?.args[0], 'sesn_stale_idle');
});

test('stale running session (> 2h) is archived', async () => {
  const { client, calls } = makeFakeClient([[staleRunningSession]]);
  const result = await reapSessions({
    client,
    now: () => NOW,
    dryRun: false,
  });
  assert.equal(result.archived.length, 1);
  assert.equal(
    calls.filter((c) => c.name === 'archive').length,
    1,
  );
});

test('stale terminated session is skipped', async () => {
  const { client, calls } = makeFakeClient([[terminatedSession]]);
  const result = await reapSessions({
    client,
    now: () => NOW,
    dryRun: false,
  });
  assert.equal(result.archived.length, 0);
  assert.equal(
    calls.filter((c) => c.name === 'archive').length,
    0,
  );
});

test('--dry-run lists stale sessions without archiving', async () => {
  const { client, calls } = makeFakeClient([
    [freshSession, staleIdleSession, staleRunningSession, terminatedSession],
  ]);
  const result = await reapSessions({
    client,
    now: () => NOW,
    dryRun: true,
  });
  assert.equal(result.candidates.length, 2);
  assert.equal(result.archived.length, 0);
  assert.equal(
    calls.filter((c) => c.name === 'archive').length,
    0,
  );
});

test('multiple pages are all walked', async () => {
  const { client } = makeFakeClient([
    [freshSession],
    [staleIdleSession],
    [staleRunningSession, terminatedSession],
  ]);
  const result = await reapSessions({
    client,
    now: () => NOW,
    dryRun: false,
  });
  assert.equal(result.candidates.length, 2);
  assert.equal(result.archived.length, 2);
});

test('archive failures are logged but do not stop the sweep', async () => {
  const calls: Call[] = [];
  let archiveAttempt = 0;
  const client: ReaperClient = {
    beta: {
      sessions: {
        list: async () => {
          return (async function* iter() {
            yield staleIdleSession;
            yield staleRunningSession;
          })();
        },
        archive: async (sessionId) => {
          archiveAttempt += 1;
          calls.push({ name: 'archive', args: [sessionId] });
          if (archiveAttempt === 1) {
            throw new Error('transient archive failure');
          }
          return { id: sessionId };
        },
      },
    },
  };
  const errors: string[] = [];
  const result = await reapSessions({
    client,
    now: () => NOW,
    dryRun: false,
    logger: {
      info: () => {},
      warn: () => {},
      error: (m: string) => errors.push(m),
    },
  });
  assert.equal(result.archived.length, 1);
  assert.equal(result.failed.length, 1);
  assert.equal(calls.length, 2);
  assert.ok(errors.some((e) => e.includes('sesn_stale_idle')));
});
