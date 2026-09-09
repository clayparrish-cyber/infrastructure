import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatRockLabel, ROCK_DISPLAY_NAMES } from '../work-items.js';

// ---------------------------------------------------------------------------
// formatRockLabel — pure label lookup used by `cc wi priorities`'s TTY
// output (2026-09-09: rock is a first-class work-item field, ruling
// 2026-09-02 "Rocks are priorities").
// ---------------------------------------------------------------------------

test('formatRockLabel: each of the six allowed rocks has a human label', () => {
  const rocks = ['prepare-gt-2027', 'raise-capital', '500-doors', 'national-brand', 'third-flavor', 'none'];
  for (const rock of rocks) {
    assert.equal(formatRockLabel(rock), ROCK_DISPLAY_NAMES[rock]);
  }
});

test('formatRockLabel: none maps to "No Rock", not the literal slug', () => {
  assert.equal(formatRockLabel('none'), 'No Rock');
});

test('formatRockLabel: an unrecognized rock falls back to the raw slug rather than "undefined"', () => {
  assert.equal(formatRockLabel('some-future-rock'), 'some-future-rock');
});
