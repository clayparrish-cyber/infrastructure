/**
 * Server-side prompt assembly — the TypeScript replacement for the bash
 * augmented-prompt block in `.github/workflows/nightly-review.yml:728-755`.
 *
 * Combines, in the exact same order as the bash version:
 *
 *   1. BASE_PROMPT               — `agents/reviews/{projectId}/{agentId}.md`
 *   2. GUARDRAILS_SECTION        — `agents/includes/marketing-execution-guardrails.md`
 *                                  (only for agents matching the marketing regex)
 *   3. BUSINESS_CONTEXT_SECTION  — render-agent-business-context.render(project, agent)
 *   4. LESSONS_SECTION           — render-agent-lessons.render(project, agent)
 *   5. META_DIRECTIVES_SECTION   — render-agent-meta-directives.render(project, agent)
 *   6. AGENT_MEMORY_SECTION      — build-agent-context.render(project, agent)
 *
 * Empty sections (empty string from the renderer) are skipped entirely —
 * they are NOT included as empty-string joins. Each non-empty section is
 * separated from its neighbors by `\n\n`.
 *
 * The 4 render functions were refactored in the sibling commit
 * "refactor(managed): expose render() function in 4 agent context scripts"
 * to return strings instead of writing to stdout, so they are safe to
 * import directly here without spawning subprocesses.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { render as renderBusinessContext } from '../render-agent-business-context.js';
import { render as renderLessons } from '../render-agent-lessons.js';
import { render as renderMetaDirectives } from '../render-agent-meta-directives.js';
import { render as renderAgentMemory } from '../build-agent-context.js';

// ---------------------------------------------------------------------------
// Repo layout — resolved relative to this file so CI and local both work.
// ---------------------------------------------------------------------------

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
// agents/lib/managed/ → agents/lib → agents → <repo root>
const REPO_ROOT = join(MODULE_DIR, '..', '..', '..');
const REVIEWS_DIR = join(REPO_ROOT, 'agents', 'reviews');
const GUARDRAILS_PATH = join(
  REPO_ROOT,
  'agents',
  'includes',
  'marketing-execution-guardrails.md',
);

// Keep in sync with `nightly-review.yml:737`.
const MARKETING_AGENT_PATTERN =
  /(aso-retention|content-value|content-writer|creative-provocateur|marketing)/;

// ---------------------------------------------------------------------------
// Dependency injection — the 4 renderers are imported by default but can be
// swapped out by tests via `deps`. Same signature in every renderer.
// ---------------------------------------------------------------------------

export type RenderFn = (project: string, agentId: string) => Promise<string>;

export interface PromptBuilderDeps {
  renderBusinessContext: RenderFn;
  renderLessons: RenderFn;
  renderMetaDirectives: RenderFn;
  renderAgentMemory: RenderFn;
  readGuardrails?: () => string;
  readBasePrompt?: (projectId: string, agentId: string) => string;
}

const defaultDeps: PromptBuilderDeps = {
  renderBusinessContext,
  renderLessons,
  renderMetaDirectives,
  renderAgentMemory,
};

function defaultReadBasePrompt(projectId: string, agentId: string): string {
  const path = join(REVIEWS_DIR, projectId, `${agentId}.md`);
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Base prompt not found for project=${projectId}, agent=${agentId}: ${msg}`,
    );
  }
}

function defaultReadGuardrails(): string {
  try {
    return readFileSync(GUARDRAILS_PATH, 'utf8');
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the fully-assembled augmented prompt for a given project/agent
 * pair. Behavior parity with `nightly-review.yml:728-755`.
 *
 * Throws if the base prompt file does not exist. All other sections are
 * optional — their renderers return empty string and those sections are
 * skipped entirely.
 */
export async function buildAugmentedPrompt(
  projectId: string,
  agentId: string,
  deps: Partial<PromptBuilderDeps> = {},
): Promise<string> {
  const resolved: PromptBuilderDeps = { ...defaultDeps, ...deps };
  const readBasePrompt = resolved.readBasePrompt ?? defaultReadBasePrompt;
  const readGuardrails = resolved.readGuardrails ?? defaultReadGuardrails;

  const basePrompt = readBasePrompt(projectId, agentId);

  const sections: string[] = [basePrompt];

  if (MARKETING_AGENT_PATTERN.test(agentId)) {
    const guardrails = readGuardrails();
    if (guardrails && guardrails.trim() !== '') {
      sections.push(guardrails);
    }
  }

  // Run the 4 async renderers in parallel — they are independent and all
  // hit Supabase. Sequential would double the wall-clock time for no gain.
  const [businessContext, lessons, metaDirectives, agentMemory] = await Promise.all([
    resolved.renderBusinessContext(projectId, agentId),
    resolved.renderLessons(projectId, agentId),
    resolved.renderMetaDirectives(projectId, agentId),
    resolved.renderAgentMemory(projectId, agentId),
  ]);

  for (const section of [businessContext, lessons, metaDirectives, agentMemory]) {
    if (section && section.trim() !== '') {
      sections.push(section);
    }
  }

  return sections.join('\n\n');
}
