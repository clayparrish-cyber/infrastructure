import { readFileSync, existsSync } from 'node:fs'

const registryPath = new URL('../agents/registry.json', import.meta.url)
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

  if (!existsSync(project.path)) {
    throw new Error(`Project ${projectId} points to a missing path: ${project.path}`)
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
  `Validated registry v${registry.version}: ${Object.keys(registry.projects).length} projects, ${registry.agents.length} agents`
)
