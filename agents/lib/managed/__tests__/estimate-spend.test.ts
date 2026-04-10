import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateSpend } from '../run-nightly.js';
import type { Roster } from '../types.js';

// Fake SupabaseWriterClient-ish shape extended with the .gte chain the
// real client supports. estimateSpend casts to this at runtime.
interface FakeRow {
  agent_id: string;
  project: string;
  cost_estimate: number | null;
}

function makeFakeSupabase(rows: FakeRow[], opts: { throwOnCall?: boolean } = {}) {
  const fake = {
    from(_t: string) {
      return {
        select(_c: string) {
          return {
            async gte(_col: string, _val: string) {
              if (opts.throwOnCall) throw new Error('supabase boom');
              return { data: rows, error: null };
            },
          };
        },
        // Below satisfy the SupabaseWriterClient shape so the cast works.
        async insert() {
          return { error: null };
        },
        async upsert() {
          return { error: null };
        },
      };
    },
  };
  return fake as unknown as Parameters<typeof estimateSpend>[1];
}

const A: Roster['roster'][0] = {
  agent_id: 'security-review',
  project: 'sidelineiq',
  priority: 'high',
  reason: 'r',
};
const B: Roster['roster'][0] = {
  agent_id: 'bug-hunt-review',
  project: 'dosie',
  priority: 'medium',
  reason: 'r',
};

test('estimateSpend: empty roster → 0', async () => {
  const e = await estimateSpend(
    { roster: [], skipped: [], signals_summary: '' },
    makeFakeSupabase([]),
  );
  assert.equal(e, 0);
});

test('estimateSpend: no history → $0.50 per entry fallback', async () => {
  const e = await estimateSpend(
    { roster: [A, B], skipped: [], signals_summary: '' },
    makeFakeSupabase([]),
  );
  assert.equal(e, 1.0); // 2 * 0.5
});

test('estimateSpend: averages historical cost per (agent, project)', async () => {
  const rows: FakeRow[] = [
    { agent_id: 'security-review', project: 'sidelineiq', cost_estimate: 0.1 },
    { agent_id: 'security-review', project: 'sidelineiq', cost_estimate: 0.3 },
    { agent_id: 'bug-hunt-review', project: 'dosie', cost_estimate: 0.2 },
  ];
  const e = await estimateSpend(
    { roster: [A, B], skipped: [], signals_summary: '' },
    makeFakeSupabase(rows),
  );
  // A: avg(0.1, 0.3) = 0.2; B: 0.2. Total = 0.4
  assert.ok(Math.abs(e - 0.4) < 1e-9);
});

test('estimateSpend: mixes history and fallback for missing entries', async () => {
  const rows: FakeRow[] = [
    { agent_id: 'security-review', project: 'sidelineiq', cost_estimate: 0.25 },
  ];
  const e = await estimateSpend(
    { roster: [A, B], skipped: [], signals_summary: '' },
    makeFakeSupabase(rows),
  );
  // A: 0.25; B: fallback 0.5. Total = 0.75
  assert.ok(Math.abs(e - 0.75) < 1e-9);
});

test('estimateSpend: filters out null cost_estimate rows', async () => {
  const rows: FakeRow[] = [
    { agent_id: 'security-review', project: 'sidelineiq', cost_estimate: null },
    { agent_id: 'security-review', project: 'sidelineiq', cost_estimate: 0.4 },
  ];
  const e = await estimateSpend(
    { roster: [A], skipped: [], signals_summary: '' },
    makeFakeSupabase(rows),
  );
  assert.equal(e, 0.4);
});

test('estimateSpend: supabase throw → falls back to $0.50/entry', async () => {
  const e = await estimateSpend(
    { roster: [A, B], skipped: [], signals_summary: '' },
    makeFakeSupabase([], { throwOnCall: true }),
  );
  assert.equal(e, 1.0);
});
