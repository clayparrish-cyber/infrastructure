import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const registryUrl = new URL('../agents/registry.json', import.meta.url)
const registryPath = fileURLToPath(registryUrl)
const registry = JSON.parse(readFileSync(registryPath, 'utf8'))

if (!Number.isInteger(registry.version) || registry.version < 1) {
  throw new Error(`Invalid registry version: ${registry.version}`)
}

if (!registry.projects || typeof registry.projects !== 'object') {
  throw new Error('Registry is missing a projects object')
}

if (!Array.isArray(registry.agents) || registry.agents.length === 0) {
  throw new Error('Registry must define at least one agent')
}

// Registry `path` fields use a literal "${PROJECTS_DIR}/..." template so
// this repo stays portable and never leaks Clay's local layout (see
// git history on this file / the "sanitize repo for public release"
// commit). Resolve that template before touching the filesystem:
//
//   1. process.env.PROJECTS_DIR, if the caller set it explicitly.
//   2. Otherwise, derive it from this repo's own checkout: the registry's
//      own "infrastructure" entry is "${PROJECTS_DIR}/infrastructure", so
//      the parent of this repo IS PROJECTS_DIR on any machine where the
//      sibling projects are checked out next to this one.
const repoRoot = resolve(dirname(registryPath), '..')
const projectsDir = process.env.PROJECTS_DIR || dirname(repoRoot)

function resolveTemplatedPath(value) {
  return value.replace(/\$\{PROJECTS_DIR\}/g, projectsDir)
}

// Sibling project checkouts (gt-ops, Mainline Apps, etc.) are separate
// private repos — they are never present in this repo's own CI checkout,
// so path-existence can't be verified there. Skip that part of the check
// (but keep the schema/shape checks) whenever we're running in CI.
const skipPathExistenceCheck = Boolean(process.env.CI)

const requiredProjectFields = [
  'path',
  'repo',
  'contextFile',
  'owner',
  'stack',
  'reportDir',
  'automationProfile',
]

for (const [projectId, project] of Object.entries(registry.projects)) {
  for (const field of requiredProjectFields) {
    if (typeof project[field] !== 'string' || project[field].trim().length === 0) {
      throw new Error(`Project ${projectId} is missing required field ${field}`)
    }
  }

  if (skipPathExistenceCheck) {
    continue
  }

  const resolvedPath = resolveTemplatedPath(project.path)

  if (!existsSync(resolvedPath)) {
    throw new Error(
      `Project ${projectId} points to a missing path: ${resolvedPath}\n` +
        `  (template: "${project.path}", PROJECTS_DIR="${projectsDir}")\n` +
        `  Set PROJECTS_DIR to the folder that holds your project checkouts ` +
        `if this repo isn't checked out next to its sibling projects, or ` +
        `fix the path in agents/registry.json if it's just stale.`
    )
  }
}

const seenAgentIds = new Set()

for (const agent of registry.agents) {
  if (typeof agent.id !== 'string' || agent.id.trim().length === 0) {
    throw new Error('Every agent entry must have a non-empty id')
  }

  if (seenAgentIds.has(agent.id)) {
    throw new Error(`Duplicate agent id found: ${agent.id}`)
  }

  seenAgentIds.add(agent.id)
}

console.log(
  `Validated registry v${registry.version}: ${Object.keys(registry.projects).length} projects, ${registry.agents.length} agents` +
    (skipPathExistenceCheck ? ' (path existence check skipped in CI)' : ` (PROJECTS_DIR=${projectsDir})`)
)
