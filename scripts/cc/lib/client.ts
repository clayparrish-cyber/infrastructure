// Command Center API Client
import { readFileSync } from 'node:fs';

/**
 * Path to the mounted secret file in Managed Agents sessions.
 *
 * SDK v0.87 SessionCreateParams has no `env` field (verified 2026-04-09
 * in skill `anthropic-managed-agents-sdk-v087-gotchas`), so the nightly
 * runner instead uploads COMMAND_CENTER_API_KEY as an ephemeral session
 * file and mounts it here. The reviewer system prompt does NOT need to
 * know about this path — createClient() reads it transparently when the
 * env var is absent.
 *
 * Exported so tests can override the path via CC_API_KEY_SECRET_FILE.
 */
export const DEFAULT_CC_API_KEY_SECRET_FILE = '/run/secrets/cc-api-key';

interface ClientConfig {
  apiKey: string;
  baseUrl: string;
  timeout?: number;
}

export class ApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`API ${status}: ${body}`);
    this.name = 'ApiError';
  }
}

export class CommandCenterClient {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;

  constructor(config: ClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.timeout = config.timeout ?? 30000;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new ApiError(response.status, error);
    }

    return response.json() as Promise<T>;
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }
}

/**
 * Resolve the Command Center API key with a file-fallback chain.
 *
 * Precedence:
 *   1. COMMAND_CENTER_API_KEY env var (local dev, CI runner, GH Actions job env).
 *   2. File at $CC_API_KEY_SECRET_FILE (test override).
 *   3. File at /run/secrets/cc-api-key (Managed Agents session file mount).
 *
 * Returns the key string on success, or null if no source yielded a non-empty
 * value. Caller decides how to fail (createClient below exits with a helpful
 * message; tests can inspect the return value directly).
 *
 * Why this exists: Managed Agents SDK v0.87 has no per-session env-var
 * field, so nightly reviewer sessions cannot receive COMMAND_CENTER_API_KEY
 * the way the GH Actions runner does. Pre-fix, all 12 `cc wi create` calls
 * in GHA run 24338556554 died with "COMMAND_CENTER_API_KEY environment
 * variable not set". Uploading the key as an ephemeral session file and
 * mounting it at /run/secrets/cc-api-key keeps the secret scoped to the
 * session (auto-cleaned on archive), mounted outside the repo tree (won't
 * be git-added by a confused reviewer), and transparent to the agent —
 * the reviewer prompt only sees `cc wi create`; this file reads the key.
 */
export function resolveApiKey(
  pathOverride?: string,
): string | null {
  const fromEnv = process.env.COMMAND_CENTER_API_KEY;
  if (fromEnv && fromEnv.trim() !== '') return fromEnv.trim();

  const secretPath =
    pathOverride ??
    process.env.CC_API_KEY_SECRET_FILE ??
    DEFAULT_CC_API_KEY_SECRET_FILE;
  try {
    const contents = readFileSync(secretPath, 'utf8').trim();
    if (contents !== '') return contents;
  } catch {
    // File missing or unreadable — fall through to null. Not fatal; the
    // caller decides whether that's an error (e.g. local dev without a
    // key should still get the env-var error message, not a file-not-found
    // message that would confuse them).
  }

  return null;
}

export function createClient(urlOverride?: string): CommandCenterClient {
  const apiKey = resolveApiKey();
  if (!apiKey) {
    console.error('Error: COMMAND_CENTER_API_KEY environment variable not set.');
    console.error('Fix: export COMMAND_CENTER_API_KEY=your-key-here');
    console.error(
      '     (In Managed Agents sessions, mount the key as a file resource ' +
        `at ${DEFAULT_CC_API_KEY_SECRET_FILE}.)`,
    );
    process.exit(1);
  }

  const baseUrl = urlOverride || process.env.COMMAND_CENTER_URL || 'https://app.mainlineapps.com';

  return new CommandCenterClient({ apiKey, baseUrl });
}
