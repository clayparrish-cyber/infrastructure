#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { loadPolicy, requestFromWorkItem, resolveRoute } from './resolver.mjs'

const usage = `Usage: node scripts/model-routing/cli.mjs --profile PROFILE [options]
  --runtime claude-cli|codex-cli  --domain general|finance|logistics|specs
  --mode recommend|evaluation|production (default: recommend)
  --model ID --effort LEVEL      Explicit per-task override
  --current-model ID --current-effort LEVEL  Preserve the current user selection
  --budget-state available|unknown|exhausted --budget-kind api-usd|subscription|evaluation
  --remaining-usd NUMBER         Available API budget; cannot measure subscription capacity
  --model-revision ID --suite-id ID --suite-version DIGEST  Qualification evidence to match
  --work-item                   Read CC work item JSON from stdin
  --format json|argv-lines      argv-lines requires eligible evaluation/production route
This command only resolves policy. It never launches a model or changes account settings.`

try {
  const values = {}
  const booleans = ['--work-item', '--help']
  const options = ['--runtime', '--profile', '--domain', '--mode', '--model', '--effort', '--current-model', '--current-effort', '--budget-state', '--budget-kind', '--remaining-usd', '--model-revision', '--suite-id', '--suite-version', '--format']
  const args = process.argv.slice(2)
  while (args.length) {
    const name = args.shift()
    if (!booleans.includes(name) && !options.includes(name)) throw new Error('Unknown CLI option')
    if (Object.hasOwn(values, name)) throw new Error('Duplicate CLI option')
    values[name] = booleans.includes(name) ? true : args.shift()
    if (values[name] === undefined || values[name] === '' || String(values[name]).startsWith('--')) throw new Error('Missing CLI option value')
  }
  if (values['--help']) {
    console.log(usage)
  } else {
    const request = {}
    for (const name of ['runtime', 'profile', 'domain', 'mode']) if (values[`--${name}`] !== undefined) request[name] = values[`--${name}`]
    if (['--model-revision', '--suite-id', '--suite-version'].some(key => values[key] !== undefined)) {
      request.qualificationContext = { modelRevision: values['--model-revision'], suiteId: values['--suite-id'], suiteVersion: values['--suite-version'] }
    }
    for (const [field, prefix] of [['override', ''], ['currentSelection', 'current-']]) {
      const selection = {}
      for (const name of ['model', 'effort']) if (values[`--${prefix}${name}`] !== undefined) selection[name] = values[`--${prefix}${name}`]
      if (Object.keys(selection).length) request[field] = selection
    }
    if (['--budget-state', '--budget-kind', '--remaining-usd'].some(key => values[key] !== undefined)) {
      request.budget = { state: values['--budget-state'], kind: values['--budget-kind'] }
      if (values['--remaining-usd'] !== undefined) {
        if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(values['--remaining-usd'])) throw new Error('Invalid remaining API budget')
        request.budget.remainingUsd = Number(values['--remaining-usd'])
      }
    }
    const resolvedRequest = values['--work-item']
      ? requestFromWorkItem(JSON.parse(readFileSync(0, 'utf8')), request)
      : request
    const route = resolveRoute(loadPolicy(), resolvedRequest)
    const format = values['--format'] ?? 'json'
    if (!['json', 'argv-lines'].includes(format)) throw new Error('Unknown output format')
    if (format === 'argv-lines') {
      if (!route.dispatchEligible || route.kind !== 'model') throw new Error('No model dispatch arguments for this route')
      process.stderr.write(`Model route: ${route.model}/${route.effort}; ${route.rationale}\n`)
      process.stdout.write(`${route.argv.join('\n')}\n`)
    } else {
      process.stdout.write(`${JSON.stringify(route, null, 2)}\n`)
    }
  }
} catch (error) {
  // Invalid task input can contain secrets/control bytes; do not echo it or a stack.
  process.stderr.write(`Model routing failed: ${error instanceof SyntaxError ? 'Invalid JSON' : error.message}\n`)
  process.exitCode = 1
}
