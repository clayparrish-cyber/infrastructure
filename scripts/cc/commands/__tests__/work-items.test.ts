import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMetadataFlag } from '../work-items.js';

// ---------------------------------------------------------------------------
// parseMetadataFlag — pure parser used by `cc wi create --metadata <json>`.
//
// Reviewer system prompt (agents/lib/managed/prompts/reviewer-system.md)
// instructs nightly agents to attach severity, decision_category, files[],
// suggested_fix, and effort via this flag on every finding. Before this
// existed, all 12 `cc wi create` attempts in GHA run 24338556554 died with
// `unknown option '--metadata'`. These tests lock in the contract so that
// regression never happens again.
// ---------------------------------------------------------------------------

test('parseMetadataFlag: undefined input returns undefined', () => {
  assert.equal(parseMetadataFlag(undefined), undefined);
});

test('parseMetadataFlag: valid JSON object round-trips', () => {
  const raw = '{"severity":"high","decision_category":"auth-bypass","files":["a.ts","b.ts"]}';
  const parsed = parseMetadataFlag(raw);
  assert.deepEqual(parsed, {
    severity: 'high',
    decision_category: 'auth-bypass',
    files: ['a.ts', 'b.ts'],
  });
});

test('parseMetadataFlag: nested JSON object is preserved', () => {
  const raw = '{"suggested_fix":{"file":"auth.ts","line":42},"effort":"1h"}';
  const parsed = parseMetadataFlag(raw);
  assert.deepEqual(parsed, {
    suggested_fix: { file: 'auth.ts', line: 42 },
    effort: '1h',
  });
});

test('parseMetadataFlag: empty object is accepted', () => {
  const parsed = parseMetadataFlag('{}');
  assert.deepEqual(parsed, {});
});

test('parseMetadataFlag: invalid JSON throws a descriptive error', () => {
  assert.throws(
    () => parseMetadataFlag('{not json'),
    (err: Error) => /Invalid --metadata JSON/.test(err.message),
  );
});

test('parseMetadataFlag: JSON array is rejected (must be object)', () => {
  assert.throws(
    () => parseMetadataFlag('["a","b"]'),
    (err: Error) => /must be a JSON object \(got array\)/.test(err.message),
  );
});

test('parseMetadataFlag: JSON primitive string is rejected', () => {
  assert.throws(
    () => parseMetadataFlag('"just a string"'),
    (err: Error) => /must be a JSON object \(got string\)/.test(err.message),
  );
});

test('parseMetadataFlag: JSON number is rejected', () => {
  assert.throws(
    () => parseMetadataFlag('42'),
    (err: Error) => /must be a JSON object \(got number\)/.test(err.message),
  );
});

test('parseMetadataFlag: JSON null is rejected', () => {
  assert.throws(
    () => parseMetadataFlag('null'),
    (err: Error) => /must be a JSON object \(got null\)/.test(err.message),
  );
});

test('parseMetadataFlag: JSON boolean is rejected', () => {
  assert.throws(
    () => parseMetadataFlag('true'),
    (err: Error) => /must be a JSON object \(got boolean\)/.test(err.message),
  );
});

test('parseMetadataFlag: dryrun reviewer payload parses correctly', () => {
  // Exact shape the reviewer system prompt produces in DRY RUN MODE.
  const raw =
    '{"severity":"high","decision_category":"dryrun-auth-bypass","files":["api/login.ts"],"suggested_fix":"switch to bcrypt","effort":"30m","dryrun":true}';
  const parsed = parseMetadataFlag(raw);
  assert.equal((parsed as Record<string, unknown>).dryrun, true);
  assert.equal(
    (parsed as Record<string, unknown>).decision_category,
    'dryrun-auth-bypass',
  );
});
