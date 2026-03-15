import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { writeFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const cjsEntry = new URL('../dist/index.js', import.meta.url)
const outputFile = new URL('../dist/index.mjs', import.meta.url)

const pkg = require(fileURLToPath(cjsEntry))
const exportNames = Object.keys(pkg).sort()

const lines = [
  "import pkg from './index.js'",
  '',
  ...exportNames.map((name) => `export const ${name} = pkg.${name}`),
  '',
  'export default pkg',
  '',
]

writeFileSync(outputFile, lines.join('\n'))

console.log(`Wrote ESM wrapper with ${exportNames.length} exports to ${outputFile.pathname}`)
