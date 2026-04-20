/**
 * Session stream helper — idle gate + transcript dump.
 *
 * The managed-agents SDK exposes a server-sent-event stream of lifecycle
 * events per session. `waitForIdle` consumes that stream, collects every
 * event into an array, and resolves when the session reports
 * `session.status_idle` with `stop_reason.type === 'end_turn'`. Other
 * idle reasons are handled per the task spec:
 *
 *   - `requires_action`      → keep streaming (the caller will unblock via
 *                              events.send before calling waitForIdle again)
 *   - `retries_exhausted`    → reject with a descriptive error
 *   - session.status_terminated → reject
 *
 * Caller responsibilities:
 *   1. Create the session.
 *   2. Open the stream FIRST (via this helper) to guarantee no events are
 *      dropped. The SDK's `events.stream()` attaches the consumer before
 *      delivering the first event, but the caller must still ensure that
 *      `events.send()` runs AFTER `waitForIdle()` has started iterating.
 *      In practice, the cleanest pattern is:
 *
 *         const p = waitForIdle(client, sessionId);
 *         await client.beta.sessions.events.send(sessionId, {
 *           events: [userMessage],
 *           betas: ['managed-agents-2026-04-01'],
 *         });
 *         const result = await p;
 *
 *      `waitForIdle` returns a Promise — awaiting the SEND before the
 *      waitForIdle promise is fine because by that point the async
 *      iterator has already subscribed.
 *
 *   3. After the promise resolves or rejects, archive the session in a
 *      finally block (waitForIdle does NOT archive — its only job is
 *      stream consumption).
 *
 * Usage accounting: each `span.model_request_end` event carries a
 * `model_usage` object with flat input/output token counts. The SDK
 * does NOT emit a separate event for advisor sub-inferences at the
 * session-stream layer (they are part of the Messages API surface).
 * As a result this helper aggregates ALL model_request_end tokens into
 * `executor_*` fields and leaves `advisor_*` at 0. Advisor breakdown
 * will be added when (if) the SDK exposes it on the session stream.
 * Downstream cost computation handles this correctly: if advisor_*
 * tokens are 0, only executor model rates are applied.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';
import { computeCostUsd } from './cost.js';
import { DEFAULTS, getEnv } from './env.js';
import type { SessionUsage } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionWaitResult {
  /** Full event array, typed as unknown[] because downstream consumers each
   *  parse only the specific event variants they care about. */
  events: unknown[];
  /** Text concatenation of all text blocks in the most recent
   *  `agent.message` event. Empty string if no agent.message was emitted. */
  finalMessage: string;
  /** Usage accounting pulled from span.model_request_end events. */
  usage: SessionUsage;
  /** Echoed back so callers in chains don't have to keep passing this
   *  around alongside the wait result. */
  sessionId: string;
}

export interface WaitForIdleOptions {
  /** Overall timeout in milliseconds. Defaults to
   *  `getEnv().SESSION_TIMEOUT_SEC * 1000` so tests that set a tiny env
   *  var get a tiny timeout, and production uses the 20-minute default. */
  timeoutMs?: number;
  /** Override the executor model name passed to cost computation. Defaults
   *  to `claude-haiku-4-5` because the reviewer (the hottest path) uses
   *  Haiku. Orchestrator callers override to `claude-opus-4-6`, worker to
   *  `claude-sonnet-4-6`. */
  executorModel?: 'claude-haiku-4-5' | 'claude-sonnet-4-6' | 'claude-opus-4-6';
}

// Minimal shape of the client that waitForIdle needs. Using a narrow
// structural type instead of `Anthropic` lets tests pass a hand-rolled fake
// without casting. Production code passes a real Anthropic instance.
export interface SessionStreamClient {
  beta: {
    sessions: {
      events: {
        stream: (
          sessionId: string,
          params?: { betas?: Array<string> },
        ) => Promise<AsyncIterable<unknown>> | AsyncIterable<unknown>;
      };
    };
  };
}

// Event shapes we actually inspect. Kept minimal so the `unknown[]` event
// array parses cleanly without dragging in the entire SDK event union.
interface TextBlockLike {
  type: 'text';
  text: string;
}
interface AgentMessageEventLike {
  type: 'agent.message';
  content: Array<TextBlockLike | { type: string }>;
}
interface SpanModelRequestEndEventLike {
  type: 'span.model_request_end';
  model_usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}
interface SessionStatusIdleEventLike {
  type: 'session.status_idle';
  stop_reason:
    | { type: 'end_turn' }
    | { type: 'requires_action'; event_ids: string[] }
    | { type: 'retries_exhausted' };
}
interface SessionStatusTerminatedEventLike {
  type: 'session.status_terminated';
}

function isAgentMessage(e: unknown): e is AgentMessageEventLike {
  return (
    typeof e === 'object' &&
    e !== null &&
    (e as { type?: unknown }).type === 'agent.message' &&
    Array.isArray((e as { content?: unknown }).content)
  );
}

function isSpanModelRequestEnd(e: unknown): e is SpanModelRequestEndEventLike {
  return (
    typeof e === 'object' &&
    e !== null &&
    (e as { type?: unknown }).type === 'span.model_request_end' &&
    typeof (e as { model_usage?: unknown }).model_usage === 'object'
  );
}

function isStatusIdle(e: unknown): e is SessionStatusIdleEventLike {
  return (
    typeof e === 'object' &&
    e !== null &&
    (e as { type?: unknown }).type === 'session.status_idle'
  );
}

function isStatusTerminated(e: unknown): e is SessionStatusTerminatedEventLike {
  return (
    typeof e === 'object' &&
    e !== null &&
    (e as { type?: unknown }).type === 'session.status_terminated'
  );
}

// Hard fallback if getEnv() throws because required vars are missing (e.g.
// in tests that never set ANTHROPIC_API_KEY). Sourced from the canonical
// DEFAULTS constant in env.ts so there is exactly one place to change the
// default session timeout. Callers that want strict env enforcement should
// pass an explicit `timeoutMs` or call `getEnv()` themselves upstream.
const FALLBACK_TIMEOUT_MS = DEFAULTS.SESSION_TIMEOUT_SEC * 1000;

function resolveDefaultTimeoutMs(): number {
  try {
    return getEnv().SESSION_TIMEOUT_SEC * 1000;
  } catch {
    return FALLBACK_TIMEOUT_MS;
  }
}

function extractTextFromAgentMessage(ev: AgentMessageEventLike): string {
  const parts: string[] = [];
  for (const block of ev.content) {
    if (block.type === 'text') {
      parts.push((block as TextBlockLike).text);
    }
  }
  return parts.join('');
}

// ---------------------------------------------------------------------------
// waitForIdle
// ---------------------------------------------------------------------------

/**
 * Opens the session event stream and resolves when the session returns to
 * an idle state with `stop_reason.type === 'end_turn'`. See the module
 * docstring for ordering/caller-contract details.
 */
export async function waitForIdle(
  client: SessionStreamClient | Anthropic,
  sessionId: string,
  options: WaitForIdleOptions = {},
): Promise<SessionWaitResult> {
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? resolveDefaultTimeoutMs();
  const executorModel = options.executorModel ?? 'claude-haiku-4-5';

  const events: unknown[] = [];
  let finalMessage = '';
  const usage: SessionUsage = {
    executor_input_tokens: 0,
    executor_output_tokens: 0,
    advisor_input_tokens: 0,
    advisor_output_tokens: 0,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    total_cost_usd: 0,
    duration_ms: 0,
  };

  // `stream` may be a Promise<AsyncIterable> (Anthropic SDK) or a direct
  // AsyncIterable (test fakes). Normalize both into a single iterator.
  // Pass the managed-agents beta header explicitly — SDK v0.87 does not
  // auto-set it, matching setup-agents.ts behavior.
  const maybeStream = (
    client as SessionStreamClient
  ).beta.sessions.events.stream(sessionId, {
    betas: ['managed-agents-2026-04-01'],
  });
  const stream = await Promise.resolve(maybeStream);

  // Grab the iterator explicitly so we can call .return() in the finally
  // block. Without this, a timeout (or a terminated/retries_exhausted
  // throw) would leak the underlying HTTP stream until GC. See CC
  // finding 307376c8 (Batch B review pass).
  const iterator = (stream as AsyncIterable<unknown>)[
    Symbol.asyncIterator
  ]();

  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(
        new Error(
          `waitForIdle timed out after ${timeoutMs}ms for session ${sessionId}`,
        ),
      );
    }, timeoutMs);
  });

  const drainPromise = (async (): Promise<SessionWaitResult> => {
    // Manually iterate using the iterator we grabbed above so the
    // finally block can close the SDK stream. Using `for await ... of
    // stream` directly would hide the iterator handle and defeat
    // cleanup.
    while (true) {
      const step = await iterator.next();
      if (step.done) break;
      const event = step.value;
      events.push(event);

      if (isAgentMessage(event)) {
        finalMessage = extractTextFromAgentMessage(event);
        continue;
      }

      if (isSpanModelRequestEnd(event)) {
        const mu = event.model_usage;
        usage.executor_input_tokens += mu.input_tokens ?? 0;
        usage.executor_output_tokens += mu.output_tokens ?? 0;
        usage.cache_creation_tokens += mu.cache_creation_input_tokens ?? 0;
        usage.cache_read_tokens += mu.cache_read_input_tokens ?? 0;
        continue;
      }

      if (isStatusTerminated(event)) {
        throw new Error(
          `Session ${sessionId} terminated before end_turn. ` +
            `Inspect the session transcript for the preceding session.error event.`,
        );
      }

      if (isStatusIdle(event)) {
        const reason = event.stop_reason.type;
        if (reason === 'end_turn') {
          usage.duration_ms = Date.now() - startedAt;
          usage.total_cost_usd = computeCostUsd({
            executor_model: executorModel,
            executor_input: usage.executor_input_tokens,
            executor_output: usage.executor_output_tokens,
            advisor_input: usage.advisor_input_tokens,
            advisor_output: usage.advisor_output_tokens,
          });
          return {
            events,
            finalMessage,
            usage,
            sessionId,
          };
        }
        if (reason === 'retries_exhausted') {
          throw new Error(
            `Session ${sessionId} exhausted its retry budget. ` +
              `Session transcript collected ${events.length} events.`,
          );
        }
        // requires_action: do not resolve — the caller will unblock the
        // session by sending the awaited user events, and the stream will
        // emit another status_idle later.
        continue;
      }
    }
    throw new Error(
      `Session ${sessionId} stream closed without emitting end_turn or terminated. ` +
        `Collected ${events.length} events.`,
    );
  })();

  try {
    return await Promise.race([drainPromise, timeoutPromise]);
  } finally {
    if (timeoutHandle !== null) {
      clearTimeout(timeoutHandle);
    }
    // Close the SDK stream on every exit path — happy path, throw path,
    // and timeout path. Without this, a timeout leaves the underlying
    // fetch response body open until GC, which matters for long-lived
    // nightly processes running many sessions sequentially.
    try {
      if (typeof iterator.return === 'function') {
        await iterator.return(undefined);
      }
    } catch {
      // swallow — stream may already be closed or the SDK may not
      // support cancellation; either way, the primary result/error
      // should not be masked by a cleanup failure.
    }
  }
}

// ---------------------------------------------------------------------------
// dumpTranscript
// ---------------------------------------------------------------------------

/**
 * Writes the full event array to disk as JSON. Creates the parent
 * directory recursively. Used by every session driver (orchestrator,
 * reviewer, worker) to persist transcripts in `logs/managed/` for
 * post-run inspection, matching the observability contract in the plan.
 */
export function dumpTranscript(events: unknown[], filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(events, null, 2), 'utf8');
}
