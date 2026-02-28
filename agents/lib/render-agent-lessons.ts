#!/usr/bin/env npx tsx

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const ENV_FILE = path.join(process.env.HOME || '', '.claude', '.env');
const LESSON_SOURCE_ACCOUNT_PREFIX = 'agent-lessons:';

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

async function main() {
  const [project, agentId] = process.argv.slice(2);
  if (!project || !agentId) {
    process.exit(0);
  }

  const fileEnv = loadEnv();
  const url = process.env.SUPABASE_URL || fileEnv.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    process.exit(0);
  }

  const supabase = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await supabase
    .from('context_items')
    .select('raw_content, source_metadata, created_at')
    .eq('project', project)
    .eq('source_account', `${LESSON_SOURCE_ACCOUNT_PREFIX}${agentId}`)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error || !data || data.length === 0) {
    process.exit(0);
  }

  const lessonItem = data.find((item) => {
    const metadata = item.source_metadata;
    return Boolean(
      metadata
      && typeof metadata === 'object'
      && !Array.isArray(metadata)
      && (metadata as Record<string, unknown>).kind === 'agent_lessons'
    );
  }) || data[0];

  const content = typeof lessonItem.raw_content === 'string' ? lessonItem.raw_content.trim() : '';
  if (!content) {
    process.exit(0);
  }

  process.stdout.write(
    `## Learned Rejection Patterns — Apply These Before Filing Findings\n\n${content}\n`,
  );
}

main().catch(() => {
  process.exit(0);
});
