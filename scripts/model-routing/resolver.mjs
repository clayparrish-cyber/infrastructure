import { readFileSync } from 'node:fs'

const SAFE_ID = /^[a-z][a-z0-9.-]*$/
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra']
const MODES = ['recommend', 'evaluation', 'production']
const has = (object, key) => Object.hasOwn(object, key)

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
}

function requireId(value, label) {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) throw new Error(`Invalid ${label}`)
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

const PINNED_REPORT = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/blob\/[a-f0-9]{40}\/[A-Za-z0-9_./-]+$/
const REVISION = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/

function validateQualificationEvidence(record) {
  if (typeof record.reviewedBy !== 'string' || record.reviewedBy.trim().length < 3) throw new Error('Qualified route requires a named reviewer')
  if (typeof record.approvedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(record.approvedAt) ||
      Number.isNaN(Date.parse(record.approvedAt)) || new Date(record.approvedAt).toISOString() !== record.approvedAt.replace('Z', '.000Z')) throw new Error('Qualified route requires approval timestamp')
  if (!PINNED_REPORT.test(record.evidence)) throw new Error('Qualified route requires a commit-pinned evidence reference')
  requireId(record.modelRevision, 'observed model revision')
  requireObject(record.testSuite, 'Qualification test suite')
  const suite = record.testSuite
  requireId(suite.id, 'test suite ID')
  if (typeof suite.version !== 'string' || !REVISION.test(suite.version)) throw new Error('Test suite version must be a commit or content digest')
  if (suite.domain !== record.domain || suite.profile !== record.profile || suite.modelRevision !== record.modelRevision ||
      suite.runtime !== record.runtime || suite.model !== record.model || suite.effort !== record.effort) {
    throw new Error('Test suite must match qualified runtime, model, effort, domain, profile and model revision')
  }
  if (!PINNED_REPORT.test(suite.report)) throw new Error('Qualification requires a commit-pinned test report')
  if (suite.result !== 'pass' || !Number.isInteger(suite.cases) || suite.cases < 1) throw new Error('Qualification requires passing test cases')
  if (!validDate(record.expiresAt) || record.expiresAt < record.approvedAt.slice(0, 10)) throw new Error('Qualified route requires expiry after approval')
}

function known(object, key, label) {
  if (typeof key !== 'string' || !has(object, key)) throw new Error(`Unknown or missing ${label}`)
  return object[key]
}

function validateSelection(policy, runtime, selection) {
  requireObject(selection, 'Model selection')
  const runtimePolicy = known(policy.runtimes, runtime, 'runtime')
  const model = known(runtimePolicy.models, selection.model, 'model for runtime')
  if (!model.efforts.includes(selection.effort)) throw new Error('Unsupported effort for model/runtime')
  return model
}

/** Validate the committed catalog too: policy bytes are not an executable escape hatch. */
export function validatePolicy(policy) {
  requireObject(policy, 'Policy')
  if (policy.version !== 1) throw new Error('Unsupported policy version')
  if (!Array.isArray(policy.domains) || !policy.domains.length) throw new Error('Missing domains')
  for (const domain of policy.domains) requireId(domain, 'domain')
  requireObject(policy.runtimes, 'Runtimes')
  for (const [runtime, entry] of Object.entries(policy.runtimes)) {
    if (!['claude-cli', 'codex-cli'].includes(runtime)) throw new Error('Unsupported runtime adapter')
    if (entry.command !== (runtime === 'claude-cli' ? 'claude' : 'codex')) throw new Error('Invalid runtime command')
    requireObject(entry.models, 'Models')
    for (const [id, model] of Object.entries(entry.models)) {
      requireId(id, 'model ID')
      if (!Array.isArray(model.efforts) || !model.efforts.length || model.efforts.some(e => !EFFORTS.includes(e))) {
        throw new Error('Invalid model efforts')
      }
      if (!model.efforts.includes(model.defaultEffort) || ['max', 'ultra'].includes(model.defaultEffort)) {
        throw new Error('Invalid default effort; max/ultra require explicit selection')
      }
      if (typeof model.source !== 'string' || !model.source.trim()) throw new Error('Model capability source required')
    }
  }
  requireObject(policy.profiles, 'Profiles')
  for (const [id, profile] of Object.entries(policy.profiles)) {
    requireId(id, 'profile')
    if (typeof profile.why !== 'string' || !profile.why.trim()) throw new Error('Profile rationale required')
    if (profile.kind === 'deterministic') continue
    if (profile.kind !== 'model') throw new Error('Unknown profile kind')
    requireObject(profile.routes, 'Profile routes')
    if (!Object.keys(profile.routes).length) throw new Error('Profile routes required')
    for (const [runtime, selection] of Object.entries(profile.routes)) {
      validateSelection(policy, runtime, selection)
      if (['max', 'ultra'].includes(selection.effort)) throw new Error('Profile cannot default to max/ultra')
    }
  }
  if (!Array.isArray(policy.qualifications)) throw new Error('Qualifications must be an array')
  for (const qualification of policy.qualifications) {
    validateSelection(policy, qualification.runtime, qualification)
    const profile = known(policy.profiles, qualification.profile, 'qualification profile')
    if (profile.kind !== 'model' || !has(profile.routes, qualification.runtime)) throw new Error('Invalid qualification route')
    if (!policy.domains.includes(qualification.domain)) throw new Error('Unknown qualification domain')
    if (!['legacy', 'qualified'].includes(qualification.status)) throw new Error('Invalid qualification status')
    if (typeof qualification.evidence !== 'string' || !qualification.evidence.trim()) throw new Error('Qualification evidence required')
    if (qualification.status === 'legacy' && (qualification.profile !== 'legacy-worker' || qualification.domain !== 'general')) {
      throw new Error('Legacy continuity cannot certify another profile or business domain')
    }
    if (qualification.status === 'qualified') validateQualificationEvidence(qualification)
  }
  return policy
}

export function loadPolicy(path = new URL('../../agents/model-policy.json', import.meta.url)) {
  return validatePolicy(JSON.parse(readFileSync(path, 'utf8')))
}

function validateBudget(budget, mode) {
  if (budget === undefined) {
    if (mode !== 'recommend') throw new Error('Budget state required before dispatch')
    return 'unknown'
  }
  requireObject(budget, 'Budget')
  if (!['available', 'exhausted', 'unknown'].includes(budget.state)) throw new Error('Invalid budget state')
  if (!['api-usd', 'subscription', 'evaluation'].includes(budget.kind)) throw new Error('Invalid budget kind')
  if (mode === 'production' && budget.kind === 'evaluation') throw new Error('Evaluation budget does not authorize production dispatch')
  if (mode !== 'recommend' && budget.kind === 'api-usd' && budget.remainingUsd === undefined) throw new Error('Remaining API budget required before dispatch')
  if (budget.remainingUsd !== undefined) {
    if (budget.kind !== 'api-usd' || !Number.isFinite(budget.remainingUsd) || budget.remainingUsd < 0) {
      throw new Error('Invalid remaining API budget')
    }
    if (budget.remainingUsd === 0 && budget.state === 'available') throw new Error('API budget exhausted')
  }
  if (mode !== 'recommend' && budget.state !== 'available') throw new Error('Budget unavailable; no fallback or downgrade')
  return budget.state
}

function selectionOverride(value, label) {
  if (value === undefined) return {}
  requireObject(value, label)
  for (const key of Object.keys(value)) {
    if (!['runtime', 'model', 'effort'].includes(key)) throw new Error(`Unknown ${label} field`)
  }
  return value
}

/** Resolve a route, never run a model. Permission/tool/sandbox flags belong to the caller. */
export function resolveRoute(policy, request, { today = new Date().toISOString().slice(0, 10) } = {}) {
  validatePolicy(policy)
  requireObject(request, 'Request')
  if (!validDate(today)) throw new Error('Invalid qualification check date')
  const profile = known(policy.profiles, request.profile, 'profile')
  const mode = request.mode ?? 'recommend'
  if (!MODES.includes(mode)) throw new Error('Unknown mode')
  const domain = request.domain ?? 'general'
  if (!policy.domains.includes(domain)) throw new Error('Unknown domain')
  if (profile.kind === 'deterministic') {
    if (request.runtime || request.currentSelection || request.override) throw new Error('Deterministic work does not accept a model selection')
    return { policyVersion: policy.version, profile: request.profile, domain, mode, kind: 'deterministic', model: null, argv: [], dispatchEligible: false, rationale: profile.why }
  }
  const runtime = request.runtime
  const runtimePolicy = known(policy.runtimes, runtime, 'runtime')
  const defaultRoute = known(profile.routes, runtime, 'profile route for runtime')
  const current = selectionOverride(request.currentSelection, 'current selection')
  const override = selectionOverride(request.override, 'override')
  for (const selection of [current, override]) {
    if (selection.runtime !== undefined && selection.runtime !== runtime) throw new Error('Runtime switch requires a separate request; no provider fallback')
    if (selection.model !== undefined) known(runtimePolicy.models, selection.model, 'selected model for runtime')
  }
  // An explicit model switch uses that model's default effort unless effort was
  // explicitly supplied. Otherwise preserve the user's current model AND effort.
  let model = defaultRoute.model
  let effort = defaultRoute.effort
  for (const selection of [current, override]) {
    if (selection.model !== undefined && selection.model !== model) {
      model = selection.model
      effort = runtimePolicy.models[model].defaultEffort
    }
    if (selection.effort !== undefined) effort = selection.effort
    validateSelection(policy, runtime, { model, effort })
  }
  const budgetState = validateBudget(request.budget, mode)
  const qualificationContext = request.qualificationContext
  if (qualificationContext !== undefined) {
    requireObject(qualificationContext, 'Qualification context')
    requireId(qualificationContext.modelRevision, 'qualification model revision')
    requireId(qualificationContext.suiteId, 'qualification suite ID')
    if (typeof qualificationContext.suiteVersion !== 'string' || !REVISION.test(qualificationContext.suiteVersion)) throw new Error('Qualification suite version required')
  }
  const qualification = policy.qualifications.find(q =>
    q.runtime === runtime && q.model === model && q.effort === effort &&
    q.profile === request.profile && q.domain === domain &&
    (q.status === 'legacy' || (q.expiresAt >= today && q.approvedAt.slice(0, 10) <= today &&
      qualificationContext?.modelRevision === q.modelRevision &&
      qualificationContext?.suiteId === q.testSuite.id && qualificationContext?.suiteVersion === q.testSuite.version)))
  if (mode === 'production' && !qualification) throw new Error('Route is not qualified for this profile/domain; evaluate and approve evidence first')
  const selectionSource = Object.keys(override).length ? 'explicit-override' : Object.keys(current).length ? 'current-selection' : 'profile-candidate'
  const dispatchEligible = mode !== 'recommend'
  const argv = runtime === 'claude-cli'
    ? ['--model', model, '--effort', effort]
    : ['-m', model, '-c', `model_reasoning_effort="${effort}"`]
  return {
    policyVersion: policy.version, profile: request.profile, domain, mode, kind: 'model',
    runtime, command: runtimePolicy.command, model, effort, selectionSource,
    qualification: qualification?.status ?? 'candidate', evidence: qualification?.evidence ?? null,
    budgetState, dispatchEligible, argv: dispatchEligible ? argv : null,
    rationale: `${profile.why} Selection: ${selectionSource}. ${qualification ? `Scope status: ${qualification.status}.` : 'Candidate only; no production qualification in this domain.'}`,
  }
}

/** CC metadata supplies task preferences, never authority, mode, runtime or budget. */
export function requestFromWorkItem(item, defaults) {
  requireObject(item, 'Work item')
  const metadata = item.metadata ?? {}
  requireObject(metadata, 'Work item metadata')
  const route = has(metadata, 'model_routing') ? metadata.model_routing : {}
  requireObject(route, 'Work item model_routing')
  for (const key of Object.keys(route)) {
    if (!['profile', 'domain', 'currentSelection', 'override', 'qualificationContext'].includes(key)) throw new Error('Unsupported work item routing field')
  }
  return { ...defaults, ...route }
}
