/**
 * Lazy singletons for the Anthropic and Supabase clients used by the
 * managed-agents pipeline. Credentials are read from getEnv() on first
 * access, so importing this module is side-effect free until a client is
 * actually needed (which keeps tests and type-only imports safe).
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from './env.js';

let anthropicClient: Anthropic | null = null;
let supabaseClient: SupabaseClient | null = null;

export function getAnthropic(): Anthropic {
  if (!anthropicClient) {
    const env = getEnv();
    anthropicClient = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

export function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    const env = getEnv();
    supabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return supabaseClient;
}

/**
 * Test hook — resets cached singletons so tests can re-read env vars
 * after mutating process.env. Not exported for production use.
 */
export function __resetSdkSingletonsForTests(): void {
  anthropicClient = null;
  supabaseClient = null;
}
