# Absolute-Path Leak Audit — 2026-04-10

Audit for local absolute paths (`/Volumes/Lexar/`, `/Users/clayparrish/`, `~/.claude/`, `/Users/clay/`) leaked into **committed** files that would break when code runs in CI (GitHub Actions, Vercel build, etc.).

Scope: Mainline Apps, infrastructure, gt-ops, gt-website, brand-assets, SidelineIQ, Dosie, the-immortal-snail, menu-autopilot, AssetPulse.

Every hit below has been verified tracked via `git ls-files`. Gitignored / untracked files excluded. Documentation plans (`docs/plans/*.md`, `docs/**`) are recorded only when the path is LOAD-BEARING (not a throwaway `cd` in a historical plan). Workflow files under `.github/workflows/` were scanned in all repos — **no workflow had a leaked absolute path**.

---

## Mainline Apps (`/Volumes/Lexar/Projects/Mainline Apps`)

### HIGH severity — runtime code that will break in CI / Vercel

| File | Line | Matching line | Severity | Why it's dangerous |
|---|---|---|---|---|
| `dashboard/src/lib/server/work-item-actions.ts` | 40 | `const LEXAR_INFRA_REGISTRY = '/Volumes/Lexar/Projects/infrastructure/agents/registry.json';` | HIGH | Server-side Next.js code. If this code path is hit on Vercel, the registry read will fail. Same class of bug Clay just found in `refresh-readiness.yml`. |
| `dashboard/src/lib/server/work-item-actions.ts` | 41 | `const LEXAR_INFRA_WORKER_PROMPT = '/Volumes/Lexar/Projects/infrastructure/agents/workers/implement-finding.md';` | HIGH | Same as above — server-side hardcoded local path. |
| `dashboard/src/lib/server/work-item-actions.ts` | 95 | `path: '/Volumes/Lexar/Projects/Mainline Apps',` | HIGH | Server-side code referencing the local repo checkout path. |
| `dashboard/src/lib/server/work-item-actions.ts` | 111 | `path: '/Volumes/Lexar/Projects/Mainline Apps/dashboard',` | HIGH | Same. |
| `dashboard/src/lib/server/work-item-actions.ts` | 1306 | `const logsDir = '/Volumes/Lexar/Projects/agent-reports/logs';` | HIGH | Server-side log dir lookup — will fail on Vercel. |
| `dashboard/src/lib/server/queue-sweep-status.ts` | 38 | `'/Volumes/Lexar/Projects/agent-reports/logs',` | HIGH | Server-side code, same class. |
| `dashboard/src/lib/server/marketing-review-packs.ts` | 57-60 | 4 hardcoded roots including `'/Volumes/Lexar/Projects/Mainline Apps/dashboard/docs/social/runs'`, `'/Volumes/Lexar/Projects/Personal/SidelineIQ/sideline-iq/docs/marketing/aso'`, etc. | HIGH | Server-side review-pack scanner. Silently returns zero packs on Vercel. |
| `dashboard/scripts/refresh-automation-readiness.ts` | 20, 30 | `const DEFAULT_REGISTRY_PATH = '/Volumes/Lexar/Projects/infrastructure/agents/registry.json';` | HIGH | **This is almost certainly the script called by the original `refresh-readiness.yml` bug Clay just fixed.** Default path is a local-only absolute path. Also referenced in header comment on line 20. |
| `dashboard/scripts/run-specialist-agents.sh` | 34 | `REPORTS_DIR="${REPORTS_DIR:-/Volumes/Lexar/Projects/agent-reports}"` | HIGH | Shell default that would silently write to nowhere in CI. Has env override so tolerable if workflow always sets it. |
| `dashboard/scripts/run-specialist-agents.sh` | 178 | `echo "/Volumes/Lexar/Projects/Mainline Apps/dashboard"` | MED | Hardcoded echo of local path, likely used as a `cd` target. |
| `dashboard/scripts/run-morning-agents.sh` | 39, 430 | `REPORTS_DIR="${REPORTS_DIR:-/Volumes/Lexar/Projects/agent-reports}"` and `WORKSPACE_ROOT="${WORKSPACE_ROOT:-/Volumes/Lexar/Projects}"` | HIGH | Same pattern — local-only defaults. |
| `dashboard/scripts/check-agent-health.sh` | 33 | `REPORTS_DIR="${REPORTS_DIR:-/Volumes/Lexar/Projects/agent-reports}"` | HIGH | Same pattern. |
| `dashboard/scripts/local-automation/lib/runtime-bootstrap.sh` | 24 | `local workspace_root="${MAINLINE_WORKSPACE_ROOT:-/Volumes/Lexar/Projects}"` | HIGH | Bootstrap default — anything sourcing this in CI without the env var gets a broken root. |
| `dashboard/scripts/local-automation/install-mainline-launchd.sh` | 129-130 | `if [[ -f "/Volumes/Lexar/Projects/scripts/appledouble-guard.sh" ]]` | LOW | This script is for installing **local** launchd agents — by definition local-only. The `if -f` guard makes it safe. |
| `dashboard/scripts/aso-create-review-task.sh` | 8 | `#     --run-dir "/Volumes/Lexar/Projects/Mainline Apps/dashboard/docs/marketing/runs/2026-02-16-sidelineiq-aso" \` | LOW | Comment-only usage example. |
| `dashboard/scripts/social-create-review-task.sh` | 8 | Same comment pattern | LOW | Comment-only usage example. |
| `scripts/appledouble-guard.sh` | 7-9 | Hardcoded list of local roots | LOW | Intentionally local-only utility for macOS `._*` cleanup. Not meant to run in CI. |

### MED / LOW — config and data

| File | Line | Matching line | Severity |
|---|---|---|---|
| `dashboard/data/content-library-sidelineiq.json` | 5 | `"remotionProject": "/Volumes/Lexar/Projects/Personal/SidelineIQ/sideline-iq/remotion"` | MED — consumed by content pipeline, will break if pipeline ever runs in CI |
| `dashboard/scripts/content-plans/sidelineiq-backfill-2026-03-13.json` | 4 | Same `remotionProject` pattern | MED |
| `dashboard/supabase/seed/agents.sql` | ~30 lines | Multiple `'~/.claude/agents/reviews/...'` paths stored as agent config values | MED — stored in DB as metadata; agents that resolve these paths on a non-Clay machine will fail |
| `dashboard/supabase/seed/seed-worker-agent.sql` | 11, 36 | Same pattern | MED |
| `dashboard/supabase/seed/org-development-agent.sql` | 14 | Same pattern | MED |
| `dashboard/supabase/ALL-PENDING-SQL.sql` | 12 lines | Same pattern | MED |
| `dashboard/scripts/AGENT-OPERATIONS-RUNBOOK.md` | 47, 53 | Runbook commands using `/Users/clayparrish/.claude/agents/workers/work-loop-manager.sh` | LOW — runbook doc |
| `dashboard/scripts/local-automation/prompts/sidelineiq-social-publisher.md` | 5 | `~/.claude/.env` reference in agent prompt | LOW |
| `docs/plans/2026-02-05-slice-5-context-capture-implementation.md` | 2298, 2308, 2310 | launchd plist with hardcoded `/Users/clayparrish/...` paths | LOW — doc, not live config |

---

## infrastructure (`/Volumes/Lexar/Projects/infrastructure`)

**NO HIGH-severity hits.** All `~/.claude/.env` references in live scripts/code have explicit GitHub Actions fallback logic (`if [[ -f "$HOME/.claude/.env" ]]` or "env vars are injected by CI"). The scripts gracefully degrade.

| File | Line | Matching line | Severity |
|---|---|---|---|
| `agents/workers/work-loop-manager.sh` | 103-117 | Loads `$HOME/.claude/.env` then validates required vars — fails loud with a clear message if missing | LOW — safe, has fallback |
| `agents/lib/post-approved-social.sh` | 18-22 | Same pattern (`if -f` guard) | LOW — safe, has fallback |
| `agents/lib/supabase-writer.ts` | 10, 68 | `~/.claude/.env` referenced in comments | LOW |
| `agents/lib/content-autonomy.ts` | 142 | Comment | LOW |
| `agents/lib/sync-to-supabase.ts` | 857 | Error message mentions `~/.claude/.env` | LOW |
| `scripts/install-phase1-agents.sh` | 47 | Echo referencing local plugin cache path | LOW |
| `docs/plans/2026-01-22-agent-learning-implementation.md` | ~30 lines | Historical implementation plan | LOW — doc |
| `docs/phase-1-implementation-guide.md`, `docs/plans/2026-02-25-*.md`, `docs/agent-marketplace-evaluation.md` | various | Doc references to `~/.claude/` paths | LOW |

---

## Gallant Tiger — gt-ops (`/Volumes/Lexar/Projects/Gallant Tiger/gt-ops`)

### HIGH severity

| File | Line | Matching line | Severity |
|---|---|---|---|
| `scripts/gt_investor_deck_builder.py` | 23 | `ASSETS = "/Users/clayparrish/Library/CloudStorage/GoogleDrive-clay@gallanttiger.com/Shared drives/Gallant Tiger/09 - Assets"` | HIGH — runnable script with hardcoded Google Drive CloudStorage path. Would fail anywhere but Clay's Mac. |

### MED

| File | Line | Matching line | Severity |
|---|---|---|---|
| `scripts/_archive/import-retailer-tracker.ts` | 24 | `const XLSX_PATH = '/Users/clayparrish/Library/Mobile Documents/com~apple~CloudDocs/Downloads/Retail Tracker.xlsx'` | MED — under `_archive/`, probably dead but still committed |
| `scripts/_archive/import-crm-data.ts` | 20 | Same iCloud Drive pattern | MED |
| `docs/plans/2026-03-19-operational-flowchart-exec-summary.html` | 8-11 | `@font-face { src: url('/Users/clayparrish/Library/Fonts/...') }` for 4 custom fonts | MED — HTML will render with fallback fonts if opened anywhere but Clay's Mac. Committed HTML deliverable. |
| `CLAUDE.md` | 272 | `Run /Volumes/Lexar/Projects/scripts/check-stale-docs.sh` | LOW — doc |
| `docs/pricing-reference.md` | 259 | `/Volumes/Lexar/Projects/Gallant Tiger/Inbound Docs/` reference | LOW — doc |
| `docs/finance-sheets/QBParser.gs` | 6 | Comment referencing local file path | LOW |
| `docs/plans/2026-04-09-wholesale-classic-accounts.md`, `2026-04-06-wholesale-flow-simplification.md`, `2026-04-03-shopify-b2b-migration.md`, `2026-03-13-po-template-overhaul.md`, `2026-03-09-nav-dashboard-impl.md`, `2026-03-07-intelligence-pipeline-phase{2,3}-impl.md`, `2026-01-15-crm-implementation.md` | various | Plan docs with `cd /Volumes/Lexar/...` or `/Users/clayparrish/Projects/Internal Systems/...` references | LOW — docs |

---

## Gallant Tiger — gt-website

| File | Line | Matching line | Severity |
|---|---|---|---|
| `CLAUDE.md` | 7, 102, 155 | Local path references (project path, screenshots dir, sell-sheet path) | LOW — doc |
| `docs/plans/2026-03-18-dtc-wholesale-shopify.md` | 69, 843 | Plan doc `cd` commands | LOW |

---

## Gallant Tiger — brand-assets

No hits.

---

## SidelineIQ (`/Volumes/Lexar/Projects/Personal/SidelineIQ/sideline-iq`)

### HIGH severity

| File | Line | Matching line | Severity |
|---|---|---|---|
| `eas.json` | 37 | `"ascApiKeyPath": "/Users/clayparrish/Downloads/AuthKey_9D66F38K8S.p8"` | HIGH — EAS submit config. If `eas submit` ever runs from a CI runner or another machine, it looks for the ASC API key at a path that does not exist. Same issue in Dosie and the-immortal-snail. |

### MED / LOW

| File | Line | Matching line | Severity |
|---|---|---|---|
| `agent-dashboard/data/data.js` | 10 | `"dashboardPath": "/Volumes/Lexar/Projects/Personal/SidelineIQ/sideline-iq/agent-dashboard"` | MED — consumed by dashboard code |
| `agent-dashboard/data/tasks.json` | 9 | Same pattern | MED |
| `scripts/check-tiktok-autopilot-setup.sh` | 136 | Echo of local path | LOW — hint/help text |

`.github/workflows/deploy.yml` was scanned and contained no leaks.

---

## Personal/Dosie (`/Volumes/Lexar/Projects/Personal/Dosie`)

### HIGH severity

| File | Line | Matching line | Severity |
|---|---|---|---|
| `apps/mobile/eas.json` | 28 | `"ascApiKeyPath": "/Users/clayparrish/Downloads/AuthKey_9D66F38K8S.p8"` | HIGH — same EAS submit path issue |
| `scripts/agents/competitive-research.ts` | 20 | `const AGENT_DASHBOARD_PATH = "/Users/clayparrish/Projects/agent-dashboard"` | HIGH — runtime code with hardcoded path. Note the path is also **wrong** (there is no agent-dashboard at that location — it was moved/retired). |

---

## the-immortal-snail (`/Volumes/Lexar/Projects/Mainline Apps/the-immortal-snail`)

Own git repo (nested), gitignored from Mainline Apps parent.

### HIGH severity

| File | Line | Matching line | Severity |
|---|---|---|---|
| `eas.json` | 33 | `"ascApiKeyPath": "/Users/clayparrish/Downloads/AuthKey_9D66F38K8S.p8"` | HIGH — same EAS submit path issue |

---

## Apolis/menu-autopilot (`/Volumes/Lexar/Projects/Apolis/menu-autopilot`)

### HIGH severity

| File | Line | Matching line | Severity |
|---|---|---|---|
| `scripts/import-parcelle-marginedge.ts` | 24 | `const BASE = "/Users/clayparrish/Library/Mobile Documents/com~apple~CloudDocs/Downloads/menu-autopilot-exports/parcelle/marginedge"` | HIGH — import script hardcoded to Clay's iCloud Drive |
| `scripts/import-products.ts` | 50 | `const csvPath = "/Users/clayparrish/Library/Mobile Documents/com~apple~CloudDocs/Downloads/products.csv"` | HIGH — same pattern |
| `scripts/test-employee-csv.ts` | 12 | `const CSV_PATH = "/Users/clayparrish/Library/.../active-employees-2026-01-13T03-49-24-740Z.csv"` | HIGH — same pattern |

### LOW

| File | Line | Matching line | Severity |
|---|---|---|---|
| `.claude/settings.local.json` | 54 | `Bash("/Users/clayparrish/.claude/plugins/cache/claude-plugins-official/ralph-wiggum/.../setup-ralph-loop.sh" ...)` | LOW — local Claude Code permissions file. This is settings.**local**.json and is normally gitignored — **verify this file should not be in git at all.** |

**FLAG**: `menu-autopilot/.claude/settings.local.json` being tracked is unusual. `settings.local.json` is Claude Code's per-machine override and should typically be gitignored.

---

## AssetPulse (`/Volumes/Lexar/Projects/AssetPulse`)

**Zero hits.** Clean.

---

## Summary counts

- **HIGH severity (runtime code that will break in CI / build / submit):** 24 hits across 6 repos
- **MED severity (config/data/docs with load-bearing local paths):** ~12
- **LOW severity (comments, docs, runbooks, guarded fallbacks):** ~30+

## The most dangerous pattern: `ascApiKeyPath`

Three separate repos (SidelineIQ, Dosie, the-immortal-snail) all have `eas.json` → `submit.production.ios.ascApiKeyPath` set to a hardcoded `/Users/clayparrish/Downloads/AuthKey_9D66F38K8S.p8`. If any of these are ever submitted from EAS Cloud or from a non-Clay machine, the submit will fail. The durable fix is to use the ASC API key ID / issuer ID via env vars (EAS supports this) instead of baking in a local file path.

## The worst offender: Mainline Apps dashboard

The dashboard has **9 server-side TS/JS files** with hardcoded `/Volumes/Lexar/` paths — this code runs on Vercel. Any code path that touches `work-item-actions.ts`, `queue-sweep-status.ts`, `marketing-review-packs.ts`, or the `refresh-automation-readiness.ts` script will either silently return zero results or throw ENOENT on Vercel. The `refresh-automation-readiness.ts` default value is directly the same bug class as `refresh-readiness.yml`.
