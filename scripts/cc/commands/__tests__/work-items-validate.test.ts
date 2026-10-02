import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseExitCodeFlag } from '../work-items.js';

// ---------------------------------------------------------------------------
// parseExitCodeFlag — pure parser used by `cc wi validate --exit <code>`.
//
// The server's apiValidationRunSchema (command-center src/lib/validation.ts)
// requires exit_code as an integer, and rejects status: 'passed' unless
// exit_code is exactly 0. The CLI derives status from this parsed value, so
// a bad parse here would silently misreport a failing run as passed (or
// vice versa) to the done-close evidence gate.
// ---------------------------------------------------------------------------

test('parseExitCodeFlag: "0" parses to 0', () => {
  assert.equal(parseExitCodeFlag('0'), 0);
});

test('parseExitCodeFlag: positive integer string parses correctly', () => {
  assert.equal(parseExitCodeFlag('1'), 1);
  assert.equal(parseExitCodeFlag('127'), 127);
});

test('parseExitCodeFlag: negative integer string parses correctly', () => {
  assert.equal(parseExitCodeFlag('-1'), -1);
});

test('parseExitCodeFlag: non-numeric input throws a descriptive error', () => {
  assert.throws(
    () => parseExitCodeFlag('passed'),
    (err: Error) => /--exit must be an integer exit code/.test(err.message),
  );
});

test('parseExitCodeFlag: float string is rejected', () => {
  assert.throws(
    () => parseExitCodeFlag('0.5'),
    (err: Error) => /--exit must be an integer exit code/.test(err.message),
  );
});

test('parseExitCodeFlag: empty string is rejected', () => {
  assert.throws(
    () => parseExitCodeFlag(''),
    (err: Error) => /--exit must be an integer exit code/.test(err.message),
  );
});

test('parseExitCodeFlag: surrounding whitespace is tolerated', () => {
  assert.equal(parseExitCodeFlag(' 0 '), 0);
});
