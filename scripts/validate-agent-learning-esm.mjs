import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const cjs = require('../packages/agent-learning/dist/index.js')
const esm = await import('../packages/agent-learning/dist/index.mjs')

const expectedFunctions = [
  'checkDirectives',
  'formatViolations',
  'generateEmbedding',
]

for (const name of expectedFunctions) {
  if (typeof cjs[name] !== 'function') {
    throw new Error(`CommonJS export ${name} is not callable`)
  }

  if (typeof esm[name] !== 'function') {
    throw new Error(`ESM export ${name} is not callable`)
  }
}

console.log(`Validated CommonJS and ESM agent-learning exports: ${expectedFunctions.join(', ')}`)
