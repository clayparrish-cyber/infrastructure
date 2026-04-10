import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCostUsd, MODEL_RATES_PER_MILLION } from '../cost.js';

// Small tolerance for floating-point math. 1e-9 is plenty — the largest
// number we multiply is on the order of ~1e6 tokens, which keeps us well
// inside IEEE 754 double precision.
const EPS = 1e-9;

test('Haiku executor only — no advisor', () => {
  // 10K input + 2K output on Haiku.
  //   input:  10_000 / 1_000_000 * $1  = $0.010
  //   output:  2_000 / 1_000_000 * $5  = $0.010
  //   total                          = $0.020
  const cost = computeCostUsd({
    executor_model: 'claude-haiku-4-5',
    executor_input: 10_000,
    executor_output: 2_000,
    advisor_input: 0,
    advisor_output: 0,
  });
  assert.ok(
    Math.abs(cost - 0.02) < EPS,
    `Expected ~$0.02, got ${cost}`,
  );
});

test('Haiku executor + Opus advisor — both contribute', () => {
  // Haiku 10K/2K + Opus advisor 1K/500
  //   exec input:  10_000 / 1_000_000 * $1  = $0.010
  //   exec out:     2_000 / 1_000_000 * $5  = $0.010
  //   adv input:    1_000 / 1_000_000 * $5  = $0.005
  //   adv out:        500 / 1_000_000 * $25 = $0.0125
  //   total                                = $0.0375
  const cost = computeCostUsd({
    executor_model: 'claude-haiku-4-5',
    executor_input: 10_000,
    executor_output: 2_000,
    advisor_input: 1_000,
    advisor_output: 500,
  });
  assert.ok(
    Math.abs(cost - 0.0375) < EPS,
    `Expected ~$0.0375, got ${cost}`,
  );
});

test('All zeros returns 0 without dividing', () => {
  const cost = computeCostUsd({
    executor_model: 'claude-haiku-4-5',
    executor_input: 0,
    executor_output: 0,
    advisor_input: 0,
    advisor_output: 0,
  });
  assert.equal(cost, 0);
});

test('Opus executor (orchestrator path) — uses Opus rates', () => {
  // 5K input + 1K output on Opus
  //   input:  5_000 / 1_000_000 * $5  = $0.025
  //   output: 1_000 / 1_000_000 * $25 = $0.025
  //   total                         = $0.050
  const cost = computeCostUsd({
    executor_model: 'claude-opus-4-6',
    executor_input: 5_000,
    executor_output: 1_000,
    advisor_input: 0,
    advisor_output: 0,
  });
  assert.ok(
    Math.abs(cost - 0.05) < EPS,
    `Expected ~$0.05, got ${cost}`,
  );
});

test('Sonnet executor (worker path) — uses Sonnet rates', () => {
  // 20K input + 4K output on Sonnet
  //   input:  20_000 / 1_000_000 * $3  = $0.060
  //   output:  4_000 / 1_000_000 * $15 = $0.060
  //   total                          = $0.120
  const cost = computeCostUsd({
    executor_model: 'claude-sonnet-4-6',
    executor_input: 20_000,
    executor_output: 4_000,
    advisor_input: 0,
    advisor_output: 0,
  });
  assert.ok(
    Math.abs(cost - 0.12) < EPS,
    `Expected ~$0.12, got ${cost}`,
  );
});

test('Unknown executor model throws with descriptive error', () => {
  assert.throws(
    () =>
      computeCostUsd({
        executor_model: 'claude-fake-9000' as 'claude-haiku-4-5',
        executor_input: 100,
        executor_output: 100,
        advisor_input: 0,
        advisor_output: 0,
      }),
    /Unknown executor model/,
  );
});

test('Rate table contains all three production models', () => {
  assert.ok(MODEL_RATES_PER_MILLION['claude-opus-4-6']);
  assert.ok(MODEL_RATES_PER_MILLION['claude-sonnet-4-6']);
  assert.ok(MODEL_RATES_PER_MILLION['claude-haiku-4-5']);
});
