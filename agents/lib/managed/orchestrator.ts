/**
 * Orchestrator session driver.
 *
 * Given a signals.json payload (produced by
 * `agents/lib/collect-orchestrator-signals.ts`), this driver uploads it
 * as a Files API file, mounts it into a managed-agents session at
 * `/workspace/signals.json`, sends the orchestrator a single user
 * message telling it to read signals + registry and emit a roster, and
 * waits for the session to idle with `end_turn`. The session is
 * archived in a `finally` block — it runs exactly once per nightly
 * run, so there is no session reuse concern.
 *
 * The final assistant message MUST be a strict JSON object matching
 * the Roster shape (see `./types.ts`). Markdown fences or prose
 * around the JSON cause the parse to throw with a 500-char preview of
 * the final message so the offending session transcript is easy to
 * locate in `logs/managed/`.
 *
 * Caller contract: this function is pure w.r.t. agent objects — it
 * does NOT call setupAll(). The caller (run-nightly.ts) is expected to
 * call setupAll() once at startup and pass the resolved IDs in.
 */

import { join } from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';
import { getAnthropic } from './sdk.js';
import { dumpTranscript, waitForIdle } from './session-stream.js';
import type { Roster } from './types.js';

// ---------------------------------------------------------------------------
// Betas
// ---------------------------------------------------------------------------

// managed-agents is required for every sessions.*, files.*, events.* call.
// advisor-tool is NOT required for the orchestrator (it is a pure judgment
// agent on Opus 4.6 — no advisor tool in its config), but harmless to pass.
const BETAS = ['managed-agents-2026-04-01'] as const;

// ---------------------------------------------------------------------------
// Minimal client shape — lets tests hand-roll a fake without casting to
// the full Anthropic type.
// ---------------------------------------------------------------------------

export interface OrchestratorClient {
  beta: {
    files: {
      upload: (
        params: { file: unknown },
        options?: { betas?: readonly string[] },
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
// runOrchestrator
// ---------------------------------------------------------------------------

export interface RunOrchestratorOptions {
  /** Override the Anthropic client — tests inject a fake here. Defaults
   *  to the real singleton from `./sdk.ts`. */
  client?: OrchestratorClient | Anthropic;
  /** Override the transcript output directory. Defaults to
   *  `logs/managed/` at the repo root. Tests point this at a temp dir. */
  logsDir?: string;
  /** Override the "today" date used in the transcript filename. Tests
   *  pin this to a known string for deterministic assertions. */
  nowDate?: string;
  /** Override the waitForIdle timeout. Undefined = use the env default
   *  (SESSION_TIMEOUT_SEC * 1000). Tests pass a small value to avoid
   *  depending on env vars being set. */
  timeoutMs?: number;
}

function isoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Runs the Orchestrator agent against a signals payload and returns the
 * parsed Roster. Throws if the final message is not strict JSON.
 *
 * @param agentId  The orchestrator agent ID from setupAll() — pinned to
 *                 the latest version.
 * @param envId    The managed-agents environment ID from setupAll().
 * @param signalsJson  The raw JSON string to upload as signals.json.
 * @param options  Optional injection points for tests.
 */
export async function runOrchestrator(
  agentId: string,
  envId: string,
  signalsJson: string,
  options: RunOrchestratorOptions = {},
): Promise<Roster> {
  const client = (options.client ?? getAnthropic()) as OrchestratorClient;

  // 1. Upload the signals blob as a Files API file so we can mount it
  //    into the session container. The SDK accepts a global File
  //    instance (Node 20+) as the `file` param.
  const signalsFile = new File([signalsJson], 'signals.json', {
    type: 'application/json',
  });
  const uploaded = await client.beta.files.upload(
    { file: signalsFile },
    { betas: BETAS },
  );

  // 2. Create the session with the signals file mounted at a known path.
  const session = await client.beta.sessions.create({
    agent: agentId,
    environment_id: envId,
    resources: [
      {
        type: 'file',
        file_id: uploaded.id,
        mount_path: '/workspace/signals.json',
      },
    ],
    betas: BETAS,
  });
  const sessionId = session.id;

  try {
    // 3. Open the stream FIRST (start iterating) so no events are dropped.
    //    waitForIdle returns a promise; by the time we `await` the send
    //    below, the iterator is already subscribed.
    const idlePromise = waitForIdle(client as OrchestratorClient, sessionId, {
      executorModel: 'claude-opus-4-6',
      timeoutMs: options.timeoutMs,
    });

    // 4. Send the initial user message.
    await client.beta.sessions.events.send(sessionId, {
      events: [
        {
          type: 'user.message',
          content: [
            {
              type: 'text',
              text:
                'Read /workspace/signals.json and /workspace/infra/agents/registry.json. ' +
                "Decide tonight's roster. Output the roster as a single JSON object " +
                'in your final message per the format spec. Your final message MUST ' +
                'be strict JSON with no markdown fences or prose around it.',
            },
          ],
        },
      ],
      betas: BETAS,
    });

    // 5. Await the idle gate.
    const result = await idlePromise;

    // 6. Dump the transcript for observability before parsing — if parse
    //    fails, we still have the session events on disk.
    const date = options.nowDate ?? isoDate();
    const logsDir = options.logsDir ?? defaultLogsDir();
    dumpTranscript(
      result.events,
      join(logsDir, `${date}-orchestrator-session.json`),
    );

    // 7. Parse the final message as strict JSON. No fence-stripping.
    let roster: Roster;
    try {
      roster = JSON.parse(result.finalMessage) as Roster;
    } catch (err) {
      const preview = result.finalMessage.slice(0, 500);
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Orchestrator final message was not strict JSON (${msg}). ` +
          `First 500 chars: ${preview}`,
      );
    }

    return roster;
  } finally {
    // Always archive — session zombies are expensive per the plan's
    // risk matrix. If archive itself throws, log a breadcrumb but do
    // not re-throw (would mask the primary error). reap-sessions.ts is
    // still the backstop for any zombies left behind.
    try {
      await client.beta.sessions.archive(sessionId, { betas: BETAS });
    } catch (archiveErr) {
      const m =
        archiveErr instanceof Error ? archiveErr.message : String(archiveErr);
      process.stderr.write(
        `[orchestrator] warn: archive failed for session ${sessionId}: ${m}\n`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Default logs dir — agents/lib/managed → agents/lib → agents → repo root
// ---------------------------------------------------------------------------

function defaultLogsDir(): string {
  // The managed-agents subtree lives at <repo>/agents/lib/managed/.
  // logs/managed/ lives at <repo>/logs/managed/. Resolve by stepping
  // up three levels from this file's directory.
  // NOTE: we can't use `import.meta.url` here in tests because of the
  // compiled-module path weirdness; cwd() is fine because run-nightly.ts
  // always starts from the repo root in CI and locally.
  return join(process.cwd(), 'logs', 'managed');
}
