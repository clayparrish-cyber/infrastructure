import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildAugmentedPrompt, type RenderFn } from '../prompt-builder.js';

// Repo layout — the tests exercise buildAugmentedPrompt against real
// fixture prompts in agents/reviews/sidelineiq/ but mock the 4 Supabase-
// backed renderers so the tests never touch the network.
const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(TEST_DIR, '..', '..', '..', '..');
const SECURITY_REVIEW_PATH = join(
  REPO_ROOT,
  'agents',
  'reviews',
  'sidelineiq',
  'security-review.md',
);
const CONTENT_WRITER_PATH = join(
  REPO_ROOT,
  'agents',
  'reviews',
  'sidelineiq',
  'content-writer.md',
);
const GUARDRAILS_PATH = join(
  REPO_ROOT,
  'agents',
  'includes',
  'marketing-execution-guardrails.md',
);

// All 4 renderers mocked to empty string by default; individual tests can
// override to simulate "Supabase returned content".
const emptyRender: RenderFn = async () => '';

const emptyDeps = {
  renderBusinessContext: emptyRender,
  renderLessons: emptyRender,
  renderMetaDirectives: emptyRender,
  renderAgentMemory: emptyRender,
};

// ---------------------------------------------------------------------------

test('buildAugmentedPrompt includes the base prompt first line and is > 500 chars', async () => {
  const securityFirstLine = readFileSync(SECURITY_REVIEW_PATH, 'utf8').split('\n')[0];
  const result = await buildAugmentedPrompt('sidelineiq', 'security-review', emptyDeps);

  assert.ok(result.includes(securityFirstLine), 'result should include base prompt first line');
  assert.ok(result.length > 500, `result length ${result.length} should exceed 500 chars`);
});

test('buildAugmentedPrompt appends guardrails for marketing agents', async () => {
  const guardrailsText = readFileSync(GUARDRAILS_PATH, 'utf8');
  // Grab a distinctive substring from the guardrails file that cannot
  // plausibly appear in the base content-writer prompt.
  const guardrailsFingerprint = 'Marketing Execution Guardrails';
  assert.ok(
    guardrailsText.includes(guardrailsFingerprint),
    'sanity: guardrails file should contain the fingerprint heading',
  );

  const result = await buildAugmentedPrompt('sidelineiq', 'content-writer', emptyDeps);
  assert.ok(
    result.includes(guardrailsFingerprint),
    'marketing agent result should contain guardrails fingerprint',
  );
});

test('buildAugmentedPrompt does NOT include guardrails for non-marketing agents', async () => {
  const result = await buildAugmentedPrompt('sidelineiq', 'security-review', emptyDeps);
  assert.ok(
    !result.includes('Marketing Execution Guardrails'),
    'non-marketing agent result should NOT contain guardrails fingerprint',
  );
});

test('buildAugmentedPrompt throws when the base prompt does not exist', async () => {
  await assert.rejects(
    () => buildAugmentedPrompt('nonexistent-project-xyz', 'security-review', emptyDeps),
    /Base prompt not found/,
  );
});

test('buildAugmentedPrompt concatenates non-empty renderer sections in order', async () => {
  const deps = {
    renderBusinessContext: (async () => 'BUSINESS_CONTEXT_MARKER') as RenderFn,
    renderLessons: (async () => 'LESSONS_MARKER') as RenderFn,
    renderMetaDirectives: (async () => 'META_DIRECTIVES_MARKER') as RenderFn,
    renderAgentMemory: (async () => 'AGENT_MEMORY_MARKER') as RenderFn,
  };
  const result = await buildAugmentedPrompt('sidelineiq', 'security-review', deps);

  // All 4 markers present.
  assert.ok(result.includes('BUSINESS_CONTEXT_MARKER'));
  assert.ok(result.includes('LESSONS_MARKER'));
  assert.ok(result.includes('META_DIRECTIVES_MARKER'));
  assert.ok(result.includes('AGENT_MEMORY_MARKER'));

  // Order matches nightly-review.yml:740-755 — business_context → lessons
  // → meta_directives → agent_memory.
  const businessIdx = result.indexOf('BUSINESS_CONTEXT_MARKER');
  const lessonsIdx = result.indexOf('LESSONS_MARKER');
  const metaIdx = result.indexOf('META_DIRECTIVES_MARKER');
  const memoryIdx = result.indexOf('AGENT_MEMORY_MARKER');
  assert.ok(businessIdx < lessonsIdx, 'business_context before lessons');
  assert.ok(lessonsIdx < metaIdx, 'lessons before meta_directives');
  assert.ok(metaIdx < memoryIdx, 'meta_directives before agent_memory');
});

test('buildAugmentedPrompt skips empty renderer sections entirely', async () => {
  const deps = {
    renderBusinessContext: (async () => '') as RenderFn,
    renderLessons: (async () => 'ONLY_LESSONS_MARKER') as RenderFn,
    renderMetaDirectives: (async () => '') as RenderFn,
    renderAgentMemory: (async () => '') as RenderFn,
  };
  const result = await buildAugmentedPrompt('sidelineiq', 'security-review', deps);

  // Base prompt + lessons separated by one '\n\n' — no extra empty
  // separators from the skipped renderers.
  assert.ok(result.includes('ONLY_LESSONS_MARKER'));
  // Skipping empty sections means there should be no `\n\n\n\n` (which
  // would indicate an empty section was concatenated).
  assert.ok(!result.includes('\n\n\n\n'), 'no quadruple newlines from empty sections');
});

test('buildAugmentedPrompt guardrails use renderBusinessContext with marketing agent too', async () => {
  // Verify that when an agent matches the marketing regex, the guardrails
  // section is inserted BEFORE the business_context section (matching the
  // bash assembly order in nightly-review.yml:740-746).
  const deps = {
    renderBusinessContext: (async () => 'BUSINESS_CONTEXT_MARKER') as RenderFn,
    renderLessons: emptyRender,
    renderMetaDirectives: emptyRender,
    renderAgentMemory: emptyRender,
  };
  const result = await buildAugmentedPrompt('sidelineiq', 'content-writer', deps);
  const guardrailsIdx = result.indexOf('Marketing Execution Guardrails');
  const businessIdx = result.indexOf('BUSINESS_CONTEXT_MARKER');
  assert.ok(guardrailsIdx >= 0 && businessIdx >= 0);
  assert.ok(guardrailsIdx < businessIdx, 'guardrails come before business_context');
});
