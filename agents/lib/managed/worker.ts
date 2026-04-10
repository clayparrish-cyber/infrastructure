/**
 * Worker session driver.
 *
 * Runs a single session that implements one approved work item: edit
 * files, commit, push a branch, and open a PR against the target
 * project repo. The worker agent is Sonnet 4.6 executor + Opus 4.6
 * advisor; the branch/PR creation happens inside the session via
 * bash + curl (per the worker system prompt).
 *
 * IMPORTANT — session environment variables: the managed-agents SDK
 * v0.87 SessionCreateParams do NOT expose any way to pass env vars
 * into the container. There is no env or environment field on
 * create(). As a result, the GitHub token that the worker needs to
 * push a branch and open a PR must travel inside the initial user
 * message, and the worker system prompt tells it to extract the
 * token from a well-known marker instead of expecting GITHUB_TOKEN.
 *
 * The repo mount already uses the same token for git clone via
 * authorization_token on the github_repository resource — so at
 * minimum the clone and any fetch work without extra setup. It's
 * the push step that needs the explicit token, because the clone
 * origin URL uses a one-shot token that can expire before push.
 *
 * Final-message markers parsed by this driver:
 *
 *     ===HUMAN_ACTION_REQUIRED===   → status: 'human-action'
 *     ===ALREADY_RESOLVED===        → status: 'already-resolved'
 *     ===BRANCH_NAME_START===X===BRANCH_NAME_END===   → branch=X
 *     ===PR_URL_START===Y===PR_URL_END===             → pr_url=Y
 *
 * Status rules:
 * - If HUMAN_ACTION_REQUIRED or ALREADY_RESOLVED, return immediately
 *   with null branch/pr_url.
 * - Otherwise branch AND pr_url must BOTH be present. If branch is
 *   present but pr_url is not, throw — the worker system prompt is
 *   explicit that a PR must be opened, and a missing PR URL means
 *   the worker failed to follow instructions.
 */

import { join } from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';
import { getAnthropic } from './sdk.js';
import { dumpTranscript, waitForIdle } from './session-stream.js';
import type { WorkerResult } from './types.js';

// ---------------------------------------------------------------------------
// Betas — worker uses advisor tool.
// ---------------------------------------------------------------------------

const BETAS = [
  'managed-agents-2026-04-01',
  'advisor-tool-2026-03-01',
] as const;

// ---------------------------------------------------------------------------
// Client shape for tests.
// ---------------------------------------------------------------------------

export interface WorkerClient {
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

export interface WorkerWorkItem {
  id: string;
  title: string;
  description: string;
  metadata?: Record<string, unknown>;
}

export interface RunWorkerOptions {
  workerAgentId: string;
  envId: string;
  workItem: WorkerWorkItem;
  projectRepoUrl: string;
  authToken: string;
  /** Test injection — defaults to the real Anthropic singleton. */
  client?: WorkerClient | Anthropic;
  /** Transcript output directory override. */
  logsDir?: string;
  /** Deterministic date in the transcript filename. */
  nowDate?: string;
  /** waitForIdle timeout override in ms. */
  timeoutMs?: number;
}

function isoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultLogsDir(): string {
  return join(process.cwd(), 'logs', 'managed');
}

// ---------------------------------------------------------------------------
// Marker regexes — kept together for easy scanning.
// ---------------------------------------------------------------------------

const HUMAN_ACTION_MARKER = '===HUMAN_ACTION_REQUIRED===';
const ALREADY_RESOLVED_MARKER = '===ALREADY_RESOLVED===';
const BRANCH_REGEX = /===BRANCH_NAME_START===([\s\S]*?)===BRANCH_NAME_END===/;
const PR_URL_REGEX = /===PR_URL_START===([\s\S]*?)===PR_URL_END===/;

// ---------------------------------------------------------------------------
// runWorker
// ---------------------------------------------------------------------------

export async function runWorker(opts: RunWorkerOptions): Promise<WorkerResult> {
  const client = (opts.client ?? getAnthropic()) as WorkerClient;

  // Build the user message. Inline the GitHub token with a marker so
  // the worker system prompt can extract it deterministically.
  const userMessageText =
    `Work item: ${opts.workItem.title}\n\n` +
    `${opts.workItem.description}\n\n` +
    `Work item ID: ${opts.workItem.id}\n\n` +
    `===GITHUB_TOKEN_START===${opts.authToken}===GITHUB_TOKEN_END===\n\n` +
    `Implement this finding per your system prompt. The GitHub token ` +
    `above is required for push and PR creation because session env ` +
    `vars are not supported. Extract it from the marker block.`;

  // Create the session with the project repo mounted.
  const session = await client.beta.sessions.create({
    agent: opts.workerAgentId,
    environment_id: opts.envId,
    resources: [
      {
        type: 'github_repository',
        url: opts.projectRepoUrl,
        authorization_token: opts.authToken,
        mount_path: '/workspace/project',
      },
    ],
    betas: BETAS,
  });
  const sessionId = session.id;

  try {
    // Stream first.
    const idlePromise = waitForIdle(client as WorkerClient, sessionId, {
      executorModel: 'claude-sonnet-4-6',
      timeoutMs: opts.timeoutMs,
    });

    // Send the work item.
    await client.beta.sessions.events.send(sessionId, {
      events: [
        {
          type: 'user.message',
          content: [{ type: 'text', text: userMessageText }],
        },
      ],
      betas: BETAS,
    });

    const result = await idlePromise;

    // Dump transcript.
    const date = opts.nowDate ?? isoDate();
    const logsDir = opts.logsDir ?? defaultLogsDir();
    dumpTranscript(
      result.events,
      join(logsDir, `${date}-worker-${opts.workItem.id}-session.json`),
    );

    // Parse markers in priority order.
    const finalMessage = result.finalMessage;

    if (finalMessage.includes(HUMAN_ACTION_MARKER)) {
      return {
        status: 'human-action',
        branch: null,
        pr_url: null,
        session_id: sessionId,
      };
    }
    if (finalMessage.includes(ALREADY_RESOLVED_MARKER)) {
      return {
        status: 'already-resolved',
        branch: null,
        pr_url: null,
        session_id: sessionId,
      };
    }

    const branchMatch = finalMessage.match(BRANCH_REGEX);
    const prUrlMatch = finalMessage.match(PR_URL_REGEX);

    if (!branchMatch || !branchMatch[1]) {
      throw new Error(
        `Worker session ${sessionId} did not emit BRANCH_NAME markers ` +
          `or any of the terminal markers (HUMAN_ACTION_REQUIRED, ` +
          `ALREADY_RESOLVED). Final message preview: ${finalMessage.slice(0, 500)}`,
      );
    }
    if (!prUrlMatch || !prUrlMatch[1]) {
      throw new Error(
        `Worker session ${sessionId} emitted a branch name but no PR URL. ` +
          `Worker system prompt requires a PR be opened for every completed ` +
          `work item. Final message preview: ${finalMessage.slice(0, 500)}`,
      );
    }

    return {
      status: 'done',
      branch: branchMatch[1].trim(),
      pr_url: prUrlMatch[1].trim(),
      session_id: sessionId,
    };
  } finally {
    try {
      await client.beta.sessions.archive(sessionId, { betas: BETAS });
    } catch {
      // swallow — don't mask primary error
    }
  }
}
