import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadPolicy, requestFromWorkItem, resolveRoute, validatePolicy } from './resolver.mjs'

const policy = loadPolicy()
const cliPath = fileURLToPath(new URL('./cli.mjs', import.meta.url))
const shellHelper = fileURLToPath(new URL('./work-item-args.sh', import.meta.url))
const budget = { state: 'available', kind: 'subscription' }
const request = { profile: 'routine', runtime: 'codex-cli', mode: 'recommend' }
const cli = (args, input) => spawnSync(process.execPath, [cliPath, ...args], { input, encoding: 'utf8' })
const route = (changes = {}, p = policy) => resolveRoute(p, { ...request, ...changes })

test('candidate ranking differentiates tasks and never defaults to max/ultra', () => {
  const expected = { routine: 'gpt-5.6-luna', 'source-analysis': 'gpt-5.6-terra', 'hard-code': 'gpt-5.6-sol', 'ambiguous-strategy': 'gpt-6-astra' }
  for (const [profile, model] of Object.entries(expected)) {
    const result = route({ profile })
    assert.equal(result.model, model)
    assert.equal(result.qualification, 'candidate')
    assert.equal(result.argv, null)
    assert.equal(result.dispatchEligible, false)
    assert.ok(result.rationale.length > 40)
    assert.ok(!['max', 'ultra'].includes(result.effort))
  }
  for (const profile of Object.values(policy.profiles)) for (const value of Object.values(profile.routes ?? {})) {
    assert.ok(!['max', 'ultra'].includes(value.effort))
  }
})

test('deterministic work needs no runtime, budget or model', () => {
  const result = resolveRoute(policy, { profile: 'deterministic', mode: 'production', domain: 'finance' })
  assert.equal(result.kind, 'deterministic')
  assert.equal(result.model, null)
  assert.deepEqual(result.argv, [])
  assert.equal(result.dispatchEligible, false)
  assert.throws(() => route({ profile: 'deterministic' }), /does not accept/)
})

test('current selection survives profile recommendation; explicit task override wins', () => {
  const currentSelection = { model: 'gpt-6-astra', effort: 'ultra' }
  const preserved = route({ currentSelection })
  assert.equal(preserved.model, currentSelection.model)
  assert.equal(preserved.effort, 'ultra')
  assert.equal(preserved.selectionSource, 'current-selection')
  const changed = route({ currentSelection, override: { model: 'gpt-5.6-sol', effort: 'high' } })
  assert.equal(changed.model, 'gpt-5.6-sol')
  assert.equal(changed.effort, 'high')
  assert.equal(changed.selectionSource, 'explicit-override')
  // Switching models must not carry Astra's unsupported ultra onto Luna.
  assert.equal(route({ currentSelection, override: { model: 'gpt-5.6-luna' } }).effort, 'medium')
})

test('runtime-specific effort capabilities are enforced before dispatch', () => {
  assert.throws(() => route({ override: { effort: 'ultra' } }), /Unsupported effort/)
  assert.throws(() => route({ override: { effort: 'none' } }), /Unsupported effort/)
  assert.throws(() => route({ runtime: 'claude-cli', override: { effort: 'ultra' } }), /Unsupported effort/)
  assert.equal(route({ runtime: 'claude-cli', override: { effort: 'xhigh' } }).effort, 'xhigh')
  assert.equal(route({ override: { effort: 'max' } }).effort, 'max')
  assert.equal(route({ profile: 'ambiguous-strategy', override: { effort: 'ultra' } }).effort, 'ultra')
})

test('unknown/missing profiles, domains, runtimes, models and modes fail explicitly', () => {
  for (const input of [
    { profile: undefined }, { profile: 'typo' }, { profile: '__proto__' }, { runtime: undefined },
    { runtime: 'openai-api' }, { runtime: 'anthropic-api' }, { domain: 'finances' }, { mode: 'autopilot' },
    { override: { model: 'unknown' } }, { override: { model: 'claude-sonnet-5' } },
    { currentSelection: { runtime: 'claude-cli', model: 'claude-sonnet-5' } },
    { profile: 'legacy-worker' }, { override: { permissions: 'bypass' } },
  ]) assert.throws(() => route(input), undefined, JSON.stringify(input))
})

test('a candidate may run in evaluation with budget but cannot silently enter production', () => {
  const evaluated = route({ mode: 'evaluation', budget })
  assert.equal(evaluated.qualification, 'candidate')
  assert.equal(evaluated.dispatchEligible, true)
  assert.deepEqual(evaluated.argv, ['-m', 'gpt-5.6-luna', '-c', 'model_reasoning_effort="medium"'])
  assert.throws(() => route({ mode: 'production', budget }), /not qualified/)
  assert.throws(() => route({ mode: 'production', budget, override: { model: 'gpt-6-astra' } }), /not qualified/)
})

test('only the declared legacy-worker scope has continuity eligibility', () => {
  const result = route({ profile: 'legacy-worker', runtime: 'claude-cli', mode: 'production', budget })
  assert.equal(result.qualification, 'legacy')
  assert.deepEqual(result.argv, ['--model', 'claude-sonnet-5', '--effort', 'high'])
  for (const domain of ['finance', 'logistics', 'specs']) {
    assert.throws(() => route({ profile: 'legacy-worker', runtime: 'claude-cli', mode: 'production', budget, domain }), /not qualified/)
  }
  assert.throws(() => route({ profile: 'legacy-worker', runtime: 'claude-cli', mode: 'production', budget, override: { model: 'claude-opus-5' } }), /not qualified/)
})

test('qualification stays within model, effort, profile, domain and validity dates', () => {
  const p = structuredClone(policy)
  const report = `https://github.com/example/fixtures/blob/${'a'.repeat(40)}/report.json`
  const scope = { runtime: 'codex-cli', model: 'gpt-5.6-luna', effort: 'medium', profile: 'routine', domain: 'finance', modelRevision: 'gpt-5.6-luna-test-revision' }
  const qualificationContext = { modelRevision: scope.modelRevision, suiteId: 'test-fixture-only', suiteVersion: 'a'.repeat(40) }
  p.qualifications.push({ ...scope, status: 'qualified', evidence: report, expiresAt: '2026-09-30', reviewedBy: 'Fixture Reviewer', approvedAt: '2026-09-10T00:00:00Z',
    testSuite: { ...scope, id: qualificationContext.suiteId, version: qualificationContext.suiteVersion, report, result: 'pass', cases: 4 } })
  const qualified = { ...request, mode: 'production', budget, domain: 'finance', qualificationContext }
  assert.equal(resolveRoute(p, qualified, { today: '2026-09-10' }).qualification, 'qualified')
  for (const changed of [{ domain: 'logistics' }, { domain: 'specs' }, { profile: 'source-analysis' }, { override: { effort: 'high' } },
    { qualificationContext: undefined }, { qualificationContext: { ...qualificationContext, modelRevision: 'another-revision' } },
    { qualificationContext: { ...qualificationContext, suiteVersion: 'b'.repeat(40) } }, { qualificationContext: { ...qualificationContext, suiteId: 'another-suite' } }]) {
    assert.throws(() => resolveRoute(p, { ...qualified, ...changed }, { today: '2026-09-10' }), /not qualified/)
  }
  assert.throws(() => resolveRoute(p, qualified, { today: '2026-09-09' }), /not qualified/)
  assert.throws(() => resolveRoute(p, qualified, { today: '2026-10-01' }), /not qualified/)
  for (const mutate of [
    q => { q.evidence = 'passed' }, q => { q.reviewedBy = '' }, q => { delete q.approvedAt },
    q => { q.approvedAt = '2026-02-31T00:00:00Z' }, q => { q.testSuite.domain = 'logistics' },
    q => { q.testSuite.modelRevision = 'another-model' }, q => { q.testSuite.effort = 'low' },
    q => { q.testSuite.result = 'fail' }, q => { q.testSuite.cases = 0 }, q => { q.testSuite.report = 'passed' },
  ]) {
    const invalid = structuredClone(p)
    mutate(invalid.qualifications.at(-1))
    assert.throws(() => validatePolicy(invalid))
  }
})

test('budget is explicit and never triggers a provider/model downgrade', () => {
  for (const mode of ['evaluation', 'production']) {
    assert.throws(() => route({ mode }), /Budget state required/)
    assert.throws(() => route({ mode, budget: { state: 'available', kind: 'api-usd' } }), /Remaining API budget required/)
    for (const state of ['unknown', 'exhausted']) assert.throws(() => route({ mode, budget: { kind: 'subscription', state } }), /Budget unavailable/)
  }
  for (const remainingUsd of [-1, NaN, Infinity, '10', 0]) {
    assert.throws(() => route({ mode: 'evaluation', budget: { kind: 'api-usd', state: 'available', remainingUsd } }), /budget/i)
  }
  assert.throws(() => route({ mode: 'evaluation', budget: { kind: 'subscription', state: 'available', remainingUsd: 20 } }), /budget/i)
  assert.throws(() => route({ mode: 'production', budget: { kind: 'evaluation', state: 'available' } }), /Evaluation budget/)
  assert.equal(route({ mode: 'evaluation', budget: { kind: 'subscription', state: 'available' } }).model, 'gpt-5.6-luna')
})

test('policy validation rejects shell syntax, commands, missing evidence and max defaults', () => {
  for (const mutate of [
    p => { p.runtimes['codex-cli'].command = 'sh' },
    p => { p.runtimes['codex-cli'].models['bad;touch-x'] = p.runtimes['codex-cli'].models['gpt-5.6-luna'] },
    p => { p.profiles.routine.routes['codex-cli'].effort = 'max' },
    p => { p.runtimes['codex-cli'].models['gpt-5.6-luna'].defaultEffort = 'max' },
    p => { p.qualifications[0].evidence = '' },
    p => { p.qualifications[0].domain = 'finance' },
    p => { p.qualifications[0].status = 'qualified'; p.qualifications[0].expiresAt = '2026-09-31' },
  ]) {
    const p = structuredClone(policy)
    mutate(p)
    assert.throws(() => validatePolicy(p))
  }
})

test('CC task preferences cannot supply authority, runtime, budget or production mode', () => {
  const defaults = { ...request, mode: 'production', budget }
  assert.equal(requestFromWorkItem({ metadata: { model_routing: { domain: 'finance' } } }, defaults).domain, 'finance')
  for (const field of ['runtime', 'budget', 'mode', 'tools', 'permissionMode']) {
    assert.throws(() => requestFromWorkItem({ metadata: { model_routing: { [field]: 'anything' } } }, defaults), /Unsupported/)
  }
  assert.throws(() => requestFromWorkItem({ metadata: { model_routing: null } }, defaults), /must be an object/)
})

test('CLI emits real argv elements, rejects malformed input and cannot launch a command', () => {
  const args = ['--profile', 'routine', '--runtime', 'codex-cli', '--mode', 'evaluation', '--budget-state', 'available', '--budget-kind', 'evaluation', '--format', 'argv-lines']
  const result = cli(args)
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(result.stdout.trim().split('\n'), ['-m', 'gpt-5.6-luna', '-c', 'model_reasoning_effort="medium"'])
  for (const invalid of [[], ['--profile'], ['--profile', 'routine', '--profile', 'routine'], ['--fake'], ['--profile', 'routine', '--runtime', 'codex-cli', '--format', 'argv-lines']]) {
    const result = cli(invalid)
    assert.equal(result.status, 1)
    assert.equal(result.stdout, '')
  }
  const broken = cli(['--work-item', ...args], '{broken')
  assert.equal(broken.status, 1)
  assert.match(broken.stderr, /Invalid JSON/)
  assert.doesNotMatch(broken.stderr, / at /)
})

test('shell integration preserves argument boundaries and fails before emitting arguments', () => {
  // These positional arguments never become shell source. Production script uses
  // the identical quoted array pattern while retaining its existing tool flags.
  const bash = (item, cap = '15', spent = '1') => spawnSync('bash', ['-c', `
    source "$1"
    result=$(model_route_work_item "$2" "$3" "$4") || exit 7
    args=()
    while IFS= read -r arg; do args+=("$arg"); done <<< "$result"
    printf '<%s>\\n' "\${args[@]}"
  `, 'routing-test', shellHelper, JSON.stringify(item), cap, spent], { encoding: 'utf8' })
  const result = bash({ id: 'fixture', metadata: {} })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, '<--model>\n<claude-sonnet-5>\n<--effort>\n<high>\n')
  assert.equal(bash({ metadata: { model_routing: { domain: 'finance' } } }).status, 7)
  const temp = mkdtempSync(join(tmpdir(), 'model-router-injection-'))
  try {
    const marker = join(temp, 'should-not-exist')
    for (const value of [`$(touch ${marker})`, `claude-sonnet-5; touch ${marker}`, `claude-sonnet-5\n--permission-mode\nbypassPermissions`]) {
      const result = bash({ metadata: { model_routing: { override: { model: value } } } })
      assert.equal(result.status, 7)
      assert.equal(result.stdout, '')
      assert.equal(existsSync(marker), false)
    }
    for (const cap of ['0', '-1', 'NaN', 'Infinity', `$(touch ${marker})`, '15;exit 0']) {
      assert.equal(bash({}, cap, '0').status, 7)
      assert.equal(existsSync(marker), false)
    }
    assert.equal(bash({}, '15', '15').status, 7)
    assert.equal(bash({}, '15', '16').status, 7)
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
})

test('worker retains its authority flags and routes before changing CC item state', () => {
  const script = readFileSync(new URL('../../agents/workers/work-loop-manager.sh', import.meta.url), 'utf8')
  for (const functionName of ['run_worker', 'run_specialist']) {
    const body = script.slice(script.indexOf(`${functionName}() {`))
    assert.ok(body.indexOf('model_route_work_item') < body.indexOf('# Mark as in_progress'))
    const invocation = body.slice(body.indexOf('if run_with_timeout 600 claude'), body.indexOf('< /dev/null > "$json_output"'))
    assert.match(invocation, /"\$\{model_args\[@\]\}"/)
    assert.match(invocation, /--permission-mode bypassPermissions/)
    assert.match(invocation, /--no-session-persistence/)
    assert.match(invocation, /--setting-sources "project,local"/)
    assert.match(invocation, functionName === 'run_worker' ? /--tools "Read,Write,Edit,Glob,Grep,Bash"/ : /--tools "Read,Glob,Grep"/)
  }
})
