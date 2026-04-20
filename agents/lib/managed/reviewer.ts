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

/**
 * Mount path inside the Managed Agents container where the nightly runner
 * uploads COMMAND_CENTER_API_KEY as a session file. Kept in sync with
 * `scripts/cc/lib/client.ts::DEFAULT_CC_API_KEY_SECRET_FILE`.
 *
 * Why a file and not an env var: Managed Agents SDK v0.87
 * SessionCreateParams has NO `env`/`environment`/`secrets` field (verified
 * 2026-04-09, see skill `anthropic-managed-agents-sdk-v087-gotchas`).
 * Pre-fix, every `cc wi create` in a reviewer session died with
 * "COMMAND_CENTER_API_KEY environment variable not set" (GHA run
 * 24338556554 had 12/12 failures). This file-mount workaround keeps the
 * secret (a) scoped to the session (auto-cleaned when the session is
 * archived), (b) outside the mounted repo tree at /workspace/ so a
 * confused reviewer cannot git-add it, and (c) transparent to the
 * reviewer — the system prompt never sees the path; `cc-bundled.js`
 * reads it via the fallback chain in createClient().
 */
export const CC_API_KEY_MOUNT_PATH = '/run/secrets/cc-api-key';

// Betas header used only on the files.upload() call below. Files API has
// its own beta gate, separate from the managed-agents beta that wraps
// session create / events / archive.
const FILES_API_BETA = 'files-api-2025-04-14';

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
    files: {
      upload: (
        params: { file: unknown; betas?: readonly string[] },
        options?: unknown,
      ) => Promise<{ id: string }>;
    };
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
  /**
   * Command Center API key to expose to the reviewer's `cc wi create`
   * invocations. Uploaded as an ephemeral session file and mounted at
   * CC_API_KEY_MOUNT_PATH. If undefined, no secret file is mounted and
   * `cc wi create` will fail inside the session — use this only in tests
   * that explicitly want that failure mode. Nightly runner passes
   * `process.env.COMMAND_CENTER_API_KEY`.
   */
  commandCenterApiKey?: string;
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

// Minimal event shape we look at for the tool-use fallback. The reviewer
// runs the Command Center CLI via the session's bash tool; each call
// surfaces as an `agent.tool_use` event with name="bash" and an `input`
// object whose `command` string contains the full shell command.
interface ToolUseEventLike {
  type: 'agent.tool_use';
  name?: string;
  input?: { command?: string } & Record<string, unknown>;
}

function isToolUseEvent(e: unknown): e is ToolUseEventLike {
  return (
    typeof e === 'object' &&
    e !== null &&
    (e as { type?: unknown }).type === 'agent.tool_use'
  );
}

/**
 * Counts the number of `cc wi create` invocations the reviewer executed
 * during the session. This is the structurally correct signal for "how
 * many work items were written" and replaces the fragile final-message
 * regex when that regex misses. Matches both `cc wi create` and
 * `cc.ts wi create` since the reviewer system prompt varies.
 */
export function countCcWiCreateInvocations(events: unknown[]): number {
  let count = 0;
  for (const ev of events) {
    if (!isToolUseEvent(ev)) continue;
    const name = ev.name ?? '';
    if (name !== 'bash') continue;
    const cmd = typeof ev.input?.command === 'string' ? ev.input.command : '';
    if (CC_WI_CREATE_REGEX.test(cmd)) count += 1;
  }
  return count;
}

const DRY_RUN_TRAILER =
  '\n\n---\n\nDRY RUN MODE: append --metadata dryrun=true to every ' +
  'cc wi create call and prefix decision_category with dryrun-.';

// Loosened from the original strict `Wrote (\d+) findings?\.` contract: we
// now accept optional surrounding whitespace/punctuation and case-insensitive
// matching so minor paraphrasing by the reviewer model doesn't silently
// drop findingsCount to 0. If the regex still misses, we fall back to
// counting `cc wi create` bash invocations in the session event stream.
const FINDINGS_COUNT_REGEX = /Wrote\s+(\d+)\s+findings?\b/i;

// Bash tool invocations that write a work item are the structurally correct
// signal for "how many findings the reviewer actually wrote." We scan the
// session events for agent.tool_use events whose bash command contains
// any of the canonical cc invocations, which is the exact pattern the
// reviewer system prompt tells the agent to run:
//   - `cc wi create` (PATH-resolved binary, if Clay runs locally)
//   - `cc.ts wi create` (legacy tsx-executed source, pre-bundle)
//   - `cc-bundled.js wi create` (current Managed Agents session path)
const CC_WI_CREATE_REGEX = /\bcc(?:\.ts|-bundled\.js)?\s+wi\s+create\b/;

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

  // 2. Upload COMMAND_CENTER_API_KEY as an ephemeral file (if provided)
  //    so the reviewer's `cc wi create` calls can authenticate. This is
  //    the workaround for the missing per-session env-var capability in
  //    SDK v0.87 — see CC_API_KEY_MOUNT_PATH comment above.
  const secretResources: Array<{
    type: 'file';
    file_id: string;
    mount_path: string;
  }> = [];
  if (opts.commandCenterApiKey && opts.commandCenterApiKey.trim() !== '') {
    const keyFile = new File(
      [opts.commandCenterApiKey.trim()],
      'cc-api-key',
      { type: 'text/plain' },
    );
    const uploaded = await client.beta.files.upload({
      file: keyFile as unknown,
      betas: [FILES_API_BETA],
    });
    secretResources.push({
      type: 'file',
      file_id: uploaded.id,
      mount_path: CC_API_KEY_MOUNT_PATH,
    });
  }

  // 3. Create the session with both repos + (optionally) the secret file
  //    mounted.
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
      ...secretResources,
    ],
    betas: BETAS,
  });
  const sessionId = session.id;

  try {
    // 4. Start streaming first — the idle promise subscribes its
    //    iterator before we await the send below.
    const idlePromise = waitForIdle(client as ReviewerClient, sessionId, {
      executorModel: 'claude-haiku-4-5',
      timeoutMs: opts.timeoutMs,
    });

    // 5. Send the augmented prompt.
    await client.beta.sessions.events.send(sessionId, {
      events: [
        {
          type: 'user.message',
          content: [{ type: 'text', text: userMessageText }],
        },
      ],
      betas: BETAS,
    });

    // 6. Await the idle gate.
    const result = await idlePromise;

    // 7. Dump transcript.
    const date = opts.nowDate ?? isoDate();
    const logsDir = opts.logsDir ?? defaultLogsDir();
    const transcriptPath = join(
      logsDir,
      `${date}-${opts.entry.agent_id}-${opts.entry.project}-session.json`,
    );
    dumpTranscript(result.events, transcriptPath);

    // 8. Parse findings count. Primary: loose regex on the final message.
    //    Fallback: count `cc wi create` tool-use invocations in the event
    //    stream (what the reviewer system prompt actually tells the agent
    //    to run per finding). This stays meaningful when the model
    //    paraphrases or drops the marker line.
    const match = FINDINGS_COUNT_REGEX.exec(result.finalMessage);
    let findingsCount = 0;
    if (match && match[1]) {
      findingsCount = Number.parseInt(match[1], 10);
    } else {
      const fallback = countCcWiCreateInvocations(result.events);
      if (fallback > 0) {
        findingsCount = fallback;
        process.stderr.write(
          `[reviewer] info: "Wrote N findings" marker missing for ` +
            `${opts.entry.agent_id}/${opts.entry.project}; using ` +
            `cc-wi-create tool-use fallback (count=${fallback}). ` +
            `Transcript: ${transcriptPath}\n`,
        );
      } else {
        process.stderr.write(
          `[reviewer] warning: no "Wrote N findings" marker AND no ` +
            `cc wi create tool invocations observed for ` +
            `${opts.entry.agent_id}/${opts.entry.project}. ` +
            `Defaulting findingsCount to 0. Transcript: ${transcriptPath}\n`,
        );
      }
    }

    return {
      findingsCount,
      usage: result.usage,
      sessionId,
    };
  } finally {
    try {
      await client.beta.sessions.archive(sessionId, { betas: BETAS });
    } catch (archiveErr) {
      // Don't mask the primary error by re-throwing, but do surface
      // the archive failure to stderr so reap-sessions.ts + CI logs
      // have a breadcrumb. Silent swallow was hiding reaper work.
      const m =
        archiveErr instanceof Error ? archiveErr.message : String(archiveErr);
      process.stderr.write(
        `[reviewer] warn: archive failed for session ${sessionId}: ${m}\n`,
      );
    }
  }
}
