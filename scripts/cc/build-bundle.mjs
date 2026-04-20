#!/usr/bin/env node
// scripts/cc/build-bundle.mjs
//
// Bundles scripts/cc/cc.ts (+ all local imports + the `commander` npm
// dependency) into a single self-contained file at scripts/cc/cc-bundled.js.
//
// Why: Managed Agents sessions mount the infrastructure repo as a raw git
// checkout at /workspace/infra with no `npm install` step available inside
// the sandbox. Before this bundler existed, every reviewer session that
// tried `npx tsx /workspace/infra/scripts/cc/cc.ts wi create ...` died with
// `Cannot find module 'commander'` (see GHA run 24338556554).
//
// The bundled artifact is committed to git so sessions can invoke it
// directly via `node /workspace/infra/scripts/cc/cc-bundled.js <args>`.
// Rebuild locally with `npm run build:cc` whenever you change any file
// under scripts/cc/. A pre-commit hook is overkill for this repo; just
// remember to rebuild before committing CLI changes.
//
// Usage:
//   node scripts/cc/build-bundle.mjs

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENTRY = resolve(__dirname, 'cc.ts');
const OUT = resolve(__dirname, 'cc-bundled.js');

await build({
  entryPoints: [ENTRY],
  bundle: true,
  platform: 'node',
  // Pin to the Node version shipped on ubuntu-latest and on the Managed
  // Agents container base image. Node 20 has `fetch` and `File` globally,
  // which the bundled CLI relies on via lib/client.ts.
  target: 'node20',
  // The bundle is invoked directly by `node`, so we emit CommonJS to keep
  // the runtime footprint simple (no ESM loader gymnastics inside the
  // sandbox).
  format: 'cjs',
  outfile: OUT,
  // Keep whitespace — the output is read by humans when debugging session
  // transcripts, and the file is tiny (~200 KB) so the size delta from
  // minification is not worth the debuggability hit.
  minify: false,
  // Keep original function + variable names for the same reason.
  keepNames: true,
  // Banner: make the file self-executing and label the source. Omits a
  // shebang on purpose — reviewer invokes via `node ...`, not `./...`, so
  // the file does not need the +x bit or a shebang.
  banner: {
    js:
      '/**\n' +
      ' * cc-bundled.js — auto-generated from scripts/cc/cc.ts by\n' +
      ' * scripts/cc/build-bundle.mjs. Do NOT edit by hand. Rebuild via:\n' +
      ' *   npm run build:cc\n' +
      ' * Runtime: node >= 20. Requires COMMAND_CENTER_API_KEY in env OR\n' +
      ' * a readable secret file at /run/secrets/cc-api-key (managed-agents\n' +
      ' * session fallback).\n' +
      ' */',
  },
  // Log what we did on success so CI logs make it clear this step ran.
  logLevel: 'info',
});

console.log(`[cc bundle] wrote ${OUT}`);
