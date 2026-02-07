#!/usr/bin/env npx tsx
/**
 * Writes the Orchestrator's roster decision to Supabase.
 * Reads from /tmp/orchestrator-roster.json and /tmp/orchestrator-knowledge.json.
 *
 * Usage: npx tsx write-orchestrator-decision.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Load env
const envPath = path.join(process.env.HOME || '', '.claude', '.env');
const env: Record<string, string> = {};
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let value = trimmed.slice(eqIdx + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        env[key] = value;
      }
    }
  }
}

// Env vars first (CI), file fallback (local)
const supabaseUrl = process.env.SUPABASE_URL || env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const rosterPath = process.env.ROSTER_PATH || '/tmp/orchestrator-roster.json';
  const knowledgePath = process.env.KNOWLEDGE_PATH || '/tmp/orchestrator-knowledge.json';

  // Read roster
  if (!fs.existsSync(rosterPath)) {
    console.error('No roster file found at', rosterPath);
    process.exit(1);
  }

  const roster = JSON.parse(fs.readFileSync(rosterPath, 'utf-8'));
  console.log(`Roster: ${roster.roster?.length || 0} runs planned, ${roster.skipped?.length || 0} skipped`);

  // Write to knowledge table
  let knowledgeContent = roster;
  if (fs.existsSync(knowledgePath)) {
    const knowledgeData = JSON.parse(fs.readFileSync(knowledgePath, 'utf-8'));
    knowledgeContent = knowledgeData.content || knowledgeData;
  }

  // Supersede previous nightly-roster entries
  const { data: existing } = await supabase
    .from('knowledge')
    .select('id')
    .eq('type', 'decision_pattern')
    .eq('subject', 'nightly-roster')
    .is('superseded_by', null);

  const { data: newEntry, error: insertError } = await supabase
    .from('knowledge')
    .insert({
      type: 'decision_pattern',
      subject: 'nightly-roster',
      project: null,
      content: knowledgeContent,
      confidence: 0.85,
      source_agent_id: 'orchestrator',
    })
    .select('id')
    .single();

  if (insertError) {
    console.error('Failed to write decision:', insertError.message);
    process.exit(1);
  }

  // Mark old entries as superseded
  if (existing && existing.length > 0 && newEntry) {
    for (const old of existing) {
      await supabase
        .from('knowledge')
        .update({ superseded_by: newEntry.id })
        .eq('id', old.id);
    }
  }

  // Log the orchestrator run to agent_runs_v2
  const { error: runError } = await supabase
    .from('agent_runs_v2')
    .insert({
      agent_id: 'orchestrator',
      project: 'all',
      trigger: 'orchestrator',
      status: 'completed',
      completed_at: new Date().toISOString(),
      findings_count: roster.roster?.length || 0,
      output_summary: roster.reasoning || 'Roster decided',
      metadata: {
        roster_size: roster.roster?.length || 0,
        skipped_count: roster.skipped?.length || 0,
      },
    });

  if (runError) {
    console.error('Failed to log orchestrator run:', runError.message);
  }

  console.log(`Decision written to knowledge table (id: ${newEntry?.id})`);
}

main().catch(console.error);
