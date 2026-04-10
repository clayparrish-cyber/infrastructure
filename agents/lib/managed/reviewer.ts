/**
 * Reviewer session driver.
 *
 * Runs a single themed code-review session for one roster entry. The
 * reviewer agent is Haiku 4.5 + Opus 4.6 advisor; it writes findings
 * via the Command Center CLI inside the session (server-side autonomy
 * logic fires automatically), and the driver only parses the finding
 * count out of the final message so run-nightly.ts knows how many to
 * bill.
 *
 * Resources mounted:
 *   1. The target project repo at /workspace/project
 *   2. The infrastructure repo at /workspace/infra (so the reviewer
 *      can invoke the cc CLI at /workspace/infra/scripts/cc/cc.ts)
 *
 * Dry-run mode appends a DRY RUN trailer to the user message telling
 * the agent to tag every Command Center write with a dryrun metadata
 * flag and prefix each decision_category with "dryrun-", so the
 * Command Center dashboard can filter the parallel-run output into a
 * separate view.
 *
 * Final-message contract: the reviewer system prompt ends with
 * "Reviewed {project} for {agentId}. Wrote N findings. Done." so the
 * driver can extract N with a simple regex. If the marker is missing,
 * the driver defaults findingsCount to 0 and logs a warning.
 */

import { join } from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';
import { buildAugmentedPrompt } from './prompt-builder.js';
import { getAnthropic } from './sdk.js';
import { dumpTranscript, waitForIdle } from './session-stream.js';
import type { RosterEntry, SessionUsage } from './types.js';

// ---------------------------------------------------------------------------
// Betas — reviewer uses advisor tool, so advisor-tool beta is required.
// ---------------------------------------------------------------------------

const BETAS = [
  'managed-agents-2026-04-01',
  'advisor-tool-2026-03-01',
] as const;

// Repo that holds the Command Center CLI; the reviewer system prompt
// invokes the cc CLI at /workspace/infra/scripts/cc/cc.ts.
const INFRA_REPO_URL = 'https://github.com/clayparrish-cyber/infrastructure';

// ---------------------------------------------------------------------------
// Minimal client shape for tests. Same pattern as orchestrator.ts.
// ---------------------------------------------------------------------------

export interface ReviewerClient {
  beta: {
    sessions: {
      create: (params: unknown) => Promise<{ id: string }>;
      archive: (
        sessionId: string,
        params?: { betas?: readonly string[] },
      ) => Promise<unknown>;
      events: {
        stream: (
          sessionId: string,
          params?: { betas?: readonly string[] },
        ) => Promise<AsyncIterable<unknown>> | AsyncIterable<unknown>;
        send: (
          sessionId: string,
          params: {
            events: Array<unknown>;
            betas?: readonly string[];
          },
        ) => Promise<unknown>;
      };
    };
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RunReviewerOptions {
  /** Pinned reviewer agent ID from setupAll(). */
  reviewerAgentId: string;
  /** Managed-agents environment ID from setupAll(). */
  envId: string;
  /** Roster entry to review. Provides the project + agent_id (theme). */
  entry: RosterEntry;
  /** GitHub URL of the project repo. */
  projectRepoUrl: string;
  /** GitHub App installation token used for cloning both repos. */
  authToken: string;
  /** When true, append a DRY RUN MODE trailer to the user message. */
  dryRun: boolean;
  /** Override the Anthropic client — tests inject a fake. */
  client?: ReviewerClient | Anthropic;
  /** Override the augmented-prompt builder — tests pass a canned string. */
  buildPrompt?: (
    projectId: string,
    agentId: string,
  ) => Promise<string>;
  /** Override the transcript output directory. Defaults to
   *  logs/managed/ at the repo root (cwd). */
  logsDir?: string;
  /** Override the "today" date used in the transcript filename. */
  nowDate?: string;
  /** Explicit waitForIdle timeout in ms. */
  timeoutMs?: number;
}

export interface RunReviewerResult {
  findingsCount: number;
  usage: SessionUsage;
  sessionId: string;
}

function isoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultLogsDir(): string {
  return join(process.cwd(), 'logs', 'managed');
}

const DRY_RUN_TRAILER =
  '\n\n---\n\nDRY RUN MODE: append --metadata dryrun=true to every ' +
  'cc wi create call and prefix decision_category with dryrun-.';

const FINDINGS_COUNT_REGEX = /Wrote (\d+) findings?\./;

/**
 * Runs a single reviewer session. See the module docstring for the
 * ordering contract (stream open before send) and dry-run semantics.
 */
export async function runReviewer(
  opts: RunReviewerOptions,
): Promise<RunReviewerResult> {
  const client = (opts.client ?? getAnthropic()) as ReviewerClient;
  const buildPrompt = opts.buildPrompt ?? buildAugmentedPrompt;

  // 1. Assemble the augmented prompt (base + guardrails + business
  //    context + lessons + meta directives + agent memory). Pure async
  //    work — no session yet.
  const basePrompt = await buildPrompt(opts.entry.project, opts.entry.agent_id);
  const userMessageText = opts.dryRun
    ? `${basePrompt}${DRY_RUN_TRAILER}`
    : basePrompt;

  // 2. Create the session with both repos mounted.
  const session = await client.beta.sessions.create({
    agent: opts.reviewerAgentId,
    environment_id: opts.envId,
    resources: [
      {
        type: 'github_repository',
        url: opts.projectRepoUrl,
        authorization_token: opts.authToken,
        mount_path: '/workspace/project',
      },
      {
        type: 'github_repository',
        url: INFRA_REPO_URL,
        authorization_token: opts.authToken,
        mount_path: '/workspace/infra',
      },
    ],
    betas: BETAS,
  });
  const sessionId = session.id;

  try {
    // 3. Start streaming first — the idle promise subscribes its
    //    iterator before we await the send below.
    const idlePromise = waitForIdle(client as ReviewerClient, sessionId, {
      executorModel: 'claude-haiku-4-5',
      timeoutMs: opts.timeoutMs,
    });

    // 4. Send the augmented prompt.
    await client.beta.sessions.events.send(sessionId, {
      events: [
        {
          type: 'user.message',
          content: [{ type: 'text', text: userMessageText }],
        },
      ],
      betas: BETAS,
    });

    // 5. Await the idle gate.
    const result = await idlePromise;

    // 6. Dump transcript.
    const date = opts.nowDate ?? isoDate();
    const logsDir = opts.logsDir ?? defaultLogsDir();
    const transcriptPath = join(
      logsDir,
      `${date}-${opts.entry.agent_id}-${opts.entry.project}-session.json`,
    );
    dumpTranscript(result.events, transcriptPath);

    // 7. Parse findings count from the final message.
    const match = FINDINGS_COUNT_REGEX.exec(result.finalMessage);
    let findingsCount = 0;
    if (match && match[1]) {
      findingsCount = Number.parseInt(match[1], 10);
    } else {
      process.stderr.write(
        `[reviewer] warning: no "Wrote N findings." marker in final message ` +
          `for ${opts.entry.agent_id}/${opts.entry.project}. ` +
          `Defaulting findingsCount to 0. Transcript: ${transcriptPath}\n`,
      );
    }

    return {
      findingsCount,
      usage: result.usage,
      sessionId,
    };
  } finally {
    try {
      await client.beta.sessions.archive(sessionId, { betas: BETAS });
    } catch {
      // swallow — don't mask primary error
    }
  }
}
