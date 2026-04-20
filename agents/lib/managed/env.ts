/**
 * Environment validation for the managed-agents pipeline.
 *
 * Returns a frozen, validated config object. Required vars throw if missing.
 * Numeric vars fall back to defaults on NaN.
 */

export interface ManagedEnv {
  ANTHROPIC_API_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  COMMAND_CENTER_API_KEY: string;
  GH_APP_ID?: string;
  GH_APP_PRIVATE_KEY?: string;
  MANAGED_AGENTS_CONCURRENCY: number;
  MANAGED_AGENTS_MAX_SPEND_USD: number;
  SESSION_TIMEOUT_SEC: number;
}

const REQUIRED_VARS = [
  'ANTHROPIC_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'COMMAND_CENTER_API_KEY',
] as const;

/**
 * Defaults for the numeric env vars. Exported so other modules can
 * reference the canonical default when they need a fallback value
 * (e.g. session-stream.ts when getEnv() throws because required vars
 * are missing in a test env).
 */
export const DEFAULTS = {
  MANAGED_AGENTS_CONCURRENCY: 8,
  MANAGED_AGENTS_MAX_SPEND_USD: 20,
  SESSION_TIMEOUT_SEC: 1200,
} as const;

function parseNumber(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function requireVar(name: (typeof REQUIRED_VARS)[number]): string {
  const val = process.env[name];
  if (!val || val.trim() === '') {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Set it in your .env or CI secrets before running managed-agents code.`,
    );
  }
  return val;
}

/**
 * Returns a frozen ManagedEnv object. Throws on any missing required var.
 */
export function getEnv(): ManagedEnv {
  const env: ManagedEnv = {
    ANTHROPIC_API_KEY: requireVar('ANTHROPIC_API_KEY'),
    SUPABASE_URL: requireVar('SUPABASE_URL'),
    SUPABASE_SERVICE_ROLE_KEY: requireVar('SUPABASE_SERVICE_ROLE_KEY'),
    COMMAND_CENTER_API_KEY: requireVar('COMMAND_CENTER_API_KEY'),
    GH_APP_ID: process.env.GH_APP_ID,
    GH_APP_PRIVATE_KEY: process.env.GH_APP_PRIVATE_KEY,
    MANAGED_AGENTS_CONCURRENCY: parseNumber(
      process.env.MANAGED_AGENTS_CONCURRENCY,
      DEFAULTS.MANAGED_AGENTS_CONCURRENCY,
    ),
    MANAGED_AGENTS_MAX_SPEND_USD: parseNumber(
      process.env.MANAGED_AGENTS_MAX_SPEND_USD,
      DEFAULTS.MANAGED_AGENTS_MAX_SPEND_USD,
    ),
    SESSION_TIMEOUT_SEC: parseNumber(
      process.env.SESSION_TIMEOUT_SEC,
      DEFAULTS.SESSION_TIMEOUT_SEC,
    ),
  };
  return Object.freeze(env);
}
