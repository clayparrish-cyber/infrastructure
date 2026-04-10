#!/usr/bin/env npx tsx

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const ENV_FILE = path.join(process.env.HOME || '', '.claude', '.env');
const META_DIRECTIVE_SOURCE_ACCOUNT_PREFIX = 'meta-directive:';

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};

  try {
    const content = fs.readFileSync(ENV_FILE, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex <= 0) continue;

      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
  } catch {
    return env;
  }

  return env;
}

/**
 * Returns the rendered "Active Meta-Review Directives" markdown section for
 * the given agent, or empty string if none apply. The project arg is
 * accepted for signature parity with the other renderers but intentionally
 * ignored (meta-directives are agent-wide).
 */
export async function render(_project: string, agentId: string): Promise<string> {
  if (!agentId) return '';

  const fileEnv = loadEnv();
  const url = process.env.SUPABASE_URL || fileEnv.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return '';

  const supabase = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await supabase
    .from('context_items')
    .select('raw_content, source_metadata, created_at')
    .eq('source_account', `${META_DIRECTIVE_SOURCE_ACCOUNT_PREFIX}${agentId}`)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error || !data || data.length === 0) return '';

  const directiveItem = data.find((item) => {
    const metadata = item.source_metadata;
    return Boolean(
      metadata
      && typeof metadata === 'object'
      && !Array.isArray(metadata)
      && (metadata as Record<string, unknown>).kind === 'meta_directives'
    );
  });

  if (!directiveItem) return '';

  const content = typeof directiveItem.raw_content === 'string' ? directiveItem.raw_content.trim() : '';
  if (!content) return '';

  return `## Active Meta-Review Directives — Follow These This Run\n\n${content}\n`;
}

// CLI shim — preserves the original stdout-streaming behavior used by
// `nightly-review.yml` via `npx tsx ... 2>/dev/null || echo ""`.
const isCli =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`;

if (isCli) {
  const [project, agentId] = process.argv.slice(2);
  render(project || '', agentId || '')
    .then((out) => {
      if (out) process.stdout.write(out);
      process.exit(0);
    })
    .catch(() => {
      process.exit(0);
    });
}
