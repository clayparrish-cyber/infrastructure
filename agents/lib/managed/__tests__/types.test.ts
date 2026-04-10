import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  RosterEntry,
  RosterSkip,
  Roster,
  ReviewerFinding,
  SessionUsage,
  ReviewResult,
  WorkerResult,
} from '../types.js';

test('RosterEntry fixture type-checks', () => {
  const e: RosterEntry = {
    agent_id: 'security-review',
    project: 'sidelineiq',
    priority: 'high',
    reason: 'git activity + open findings',
  };
  assert.equal(e.agent_id, 'security-review');
  assert.equal(e.priority, 'high');
});

test('RosterSkip fixture type-checks', () => {
  const s: RosterSkip = {
    agent_id: 'brand-voice',
    project: 'dosie',
    reason: 'no git activity in 7 days',
  };
  assert.equal(s.project, 'dosie');
});

test('Roster fixture type-checks', () => {
  const r: Roster = {
    roster: [
      {
        agent_id: 'security-review',
        project: 'sidelineiq',
        priority: 'high',
        reason: 'new auth code',
      },
    ],
    skipped: [{ agent_id: 'a11y', project: 'sidelineiq', reason: 'no UI changes' }],
    signals_summary: '3 projects had activity overnight',
  };
  assert.equal(r.roster.length, 1);
  assert.equal(r.skipped.length, 1);
  assert.ok(r.signals_summary.length > 0);
});

test('ReviewerFinding required fields only', () => {
  const f: ReviewerFinding = {
    id: 'sec-001',
    title: 'Hardcoded API key',
    description: 'Found literal API key in src/config.ts',
    severity: 'critical',
  };
  assert.equal(f.id, 'sec-001');
  assert.equal(f.severity, 'critical');
  assert.equal(f.plainEnglish, undefined);
  assert.equal(f.files, undefined);
});

test('ReviewerFinding with all optional fields populated', () => {
  const f: ReviewerFinding = {
    id: 'sec-002',
    title: 'SQL injection risk',
    description: 'Unescaped user input in query',
    severity: 'high',
    plainEnglish: 'A user could break into your database.',
    files: ['src/api/users.ts', 'src/db/query.ts'],
    suggestedFix: 'Use parameterized queries',
    effort: '30min',
    decision_category: 'security-high',
  };
  assert.equal(f.files?.length, 2);
  assert.equal(f.decision_category, 'security-high');
});

test('SessionUsage fixture type-checks', () => {
  const u: SessionUsage = {
    executor_input_tokens: 12000,
    executor_output_tokens: 3400,
    advisor_input_tokens: 500,
    advisor_output_tokens: 200,
    cache_read_tokens: 8000,
    cache_creation_tokens: 1200,
    total_cost_usd: 0.42,
    duration_ms: 45_000,
  };
  assert.equal(u.total_cost_usd, 0.42);
  assert.equal(u.duration_ms, 45_000);
});

test('ReviewResult fixture type-checks', () => {
  const result: ReviewResult = {
    findings: [
      {
        id: 'sec-001',
        title: 'Hardcoded key',
        description: 'key in config',
        severity: 'critical',
      },
    ],
    usage: {
      executor_input_tokens: 1000,
      executor_output_tokens: 200,
      advisor_input_tokens: 0,
      advisor_output_tokens: 0,
      cache_read_tokens: 0,
      cache_creation_tokens: 0,
      total_cost_usd: 0.05,
      duration_ms: 12_000,
    },
    session_id: 'sess_abc123',
    agent_id: 'security-review',
    project: 'sidelineiq',
  };
  assert.equal(result.findings.length, 1);
  assert.equal(result.session_id, 'sess_abc123');
});

test('WorkerResult done fixture type-checks', () => {
  const w: WorkerResult = {
    status: 'done',
    branch: 'agent/fix-sec-001',
    pr_url: 'https://github.com/clayparrish-cyber/sidelineiq/pull/42',
    session_id: 'sess_xyz789',
  };
  assert.equal(w.status, 'done');
  assert.ok(w.pr_url !== null);
});

test('WorkerResult human-action fixture type-checks', () => {
  const w: WorkerResult = {
    status: 'human-action',
    branch: null,
    pr_url: null,
    session_id: 'sess_xyz790',
  };
  assert.equal(w.status, 'human-action');
  assert.equal(w.branch, null);
  assert.equal(w.pr_url, null);
});

test('WorkerResult already-resolved fixture type-checks', () => {
  const w: WorkerResult = {
    status: 'already-resolved',
    branch: null,
    pr_url: null,
    session_id: 'sess_xyz791',
  };
  assert.equal(w.status, 'already-resolved');
});
