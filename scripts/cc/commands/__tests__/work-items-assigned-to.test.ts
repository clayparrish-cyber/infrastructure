import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterPrioritiesByAssignee, type PrioritiesResponse, type WorkItem } from '../work-items.js';

// ---------------------------------------------------------------------------
// filterPrioritiesByAssignee — pure client-side filter for
// `cc wi priorities --assigned-to <who>`.
//
// Verified live 2026-09-16: GET /api/work-items/priorities returns the same
// count (86) and the same 76 items across rocks with and without an
// assigned_to query param, while GET /api/work-items (list) DOES filter
// server-side on assigned_to (200 -> 45 items for assigned_to=clay). So
// `wi list --assigned-to` passes the param straight through to the API, and
// `wi priorities --assigned-to` has to filter the response itself. These
// tests lock in that client-side contract.
// ---------------------------------------------------------------------------

function item(overrides: Partial<WorkItem>): WorkItem {
  return {
    id: 'id',
    title: 'title',
    status: 'triaged',
    ...overrides,
  } as WorkItem;
}

function fixture(): PrioritiesResponse {
  return {
    rocks: [
      {
        rock: '500-doors',
        items: [
          item({ id: 'a', title: 'A', assigned_to: 'clay' }),
          item({ id: 'b', title: 'B', assigned_to: 'charlie' }),
        ],
      },
      {
        rock: 'raise-capital',
        items: [item({ id: 'c', title: 'C', assigned_to: 'clay' })],
      },
      {
        rock: 'national-brand',
        items: [item({ id: 'd', title: 'D', assigned_to: 'kamal' })],
      },
    ],
    serves_no_rock: {
      rock: 'none',
      items: [
        item({ id: 'e', title: 'E', assigned_to: 'clay' }),
        item({ id: 'f', title: 'F' }), // unassigned
      ],
    },
    count: 5,
  };
}

test('filterPrioritiesByAssignee: keeps only items assigned to the given person, across rocks and serves_no_rock', () => {
  const filtered = filterPrioritiesByAssignee(fixture(), 'clay');
  assert.deepEqual(
    filtered.rocks.map((g) => ({ rock: g.rock, ids: g.items.map((i) => i.id) })),
    [
      { rock: '500-doors', ids: ['a'] },
      { rock: 'raise-capital', ids: ['c'] },
      { rock: 'national-brand', ids: [] },
    ],
  );
  assert.deepEqual(filtered.serves_no_rock.items.map((i) => i.id), ['e']);
});

test('filterPrioritiesByAssignee: recomputes count from the filtered items, not the original response', () => {
  const filtered = filterPrioritiesByAssignee(fixture(), 'clay');
  assert.equal(filtered.count, 3); // a, c, e
});

test('filterPrioritiesByAssignee: match is case-insensitive', () => {
  const filtered = filterPrioritiesByAssignee(fixture(), 'CLAY');
  assert.equal(filtered.count, 3);
});

test('filterPrioritiesByAssignee: whitespace around the flag value is trimmed', () => {
  const filtered = filterPrioritiesByAssignee(fixture(), '  clay  ');
  assert.equal(filtered.count, 3);
});

test('filterPrioritiesByAssignee: an assignee with no items returns empty groups and count 0, not an error', () => {
  const filtered = filterPrioritiesByAssignee(fixture(), 'nobody-assigned-here');
  assert.equal(filtered.count, 0);
  for (const g of filtered.rocks) assert.equal(g.items.length, 0);
  assert.equal(filtered.serves_no_rock.items.length, 0);
});

test('filterPrioritiesByAssignee: preserves rock slugs and group order even when a group empties out', () => {
  const filtered = filterPrioritiesByAssignee(fixture(), 'kamal');
  assert.deepEqual(
    filtered.rocks.map((g) => g.rock),
    ['500-doors', 'raise-capital', 'national-brand'],
  );
  assert.deepEqual(filtered.rocks[2].items.map((i) => i.id), ['d']);
});

test('filterPrioritiesByAssignee: unassigned items (assigned_to undefined) never match a non-empty filter', () => {
  const filtered = filterPrioritiesByAssignee(fixture(), 'clay');
  assert.ok(!filtered.serves_no_rock.items.some((i) => i.id === 'f'));
});
