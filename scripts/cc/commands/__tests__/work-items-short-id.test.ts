import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickShortIdMatch, ShortIdError } from '../work-items.js';

// ---------------------------------------------------------------------------
// Short-ID resolution (2026-10-14). The server now matches the prefix across
// every status (`?id_prefix=`); the CLI picks the one match or explains why
// it can't. Before, the CLI matched only the newest 200 items, so
// `cc wi get 1e8cd83e` failed for a real snoozed item.
// ---------------------------------------------------------------------------

const A = { id: '1e8cd83e-7df2-471e-a0ee-af73d2bc61c5', title: 'Snoozed tripwire', status: 'deferred' };
const B = { id: '1e8cd83e-0000-4000-8000-000000000002', title: 'Another one', status: 'done' };
const OTHER = { id: '792862af-49f3-4389-aac8-fe703f443311', title: 'Unrelated', status: 'triaged' };

test('pickShortIdMatch: one match resolves to its full id', () => {
  assert.equal(pickShortIdMatch('1e8cd83e', [A]), A.id);
});

test('pickShortIdMatch: prefix match is case-insensitive', () => {
  assert.equal(pickShortIdMatch('1E8CD83E-7D', [A, B]), A.id);
});

test('pickShortIdMatch: no match is a ShortIdError', () => {
  assert.throws(() => pickShortIdMatch('1e8cd83e', []), (err: Error) =>
    err instanceof ShortIdError && /No work item found matching short ID "1e8cd83e"/.test(err.message));
});

test('pickShortIdMatch: several matches list every id, status and title', () => {
  assert.throws(() => pickShortIdMatch('1e8cd83e', [A, B]), (err: Error) => {
    assert.ok(err instanceof ShortIdError);
    assert.match(err.message, /Ambiguous short ID "1e8cd83e" matches 2 items/);
    assert.ok(err.message.includes(`${A.id}  [deferred]  Snoozed tripwire`));
    assert.ok(err.message.includes(`${B.id}  [done]  Another one`));
    return true;
  });
});

test('pickShortIdMatch: rows that do not start with the prefix are ignored (older server)', () => {
  // An older deploy ignores id_prefix and returns the plain list.
  assert.equal(pickShortIdMatch('792862af', [A, B, OTHER]), OTHER.id);
});
