# Workflow Failure Audit — 2026-04-10

Audit covering all `clayparrish-cyber/*` repos requested. Triggered by 2026-04-09 discovery
that `refresh-readiness.yml` in mainline-apps had silently failed 100% of runs since creation.

**Scope:** last 30-100 runs per repo, plus targeted log review for root-cause identification.

---

## Severity Key

- **CRITICAL** — business-impacting (silent prod failure, missed automation, data loss risk)
- **HIGH** — wasted runs, developer friction, blocks CI gates
- **MEDIUM** — experimental or non-blocking, but still noisy
- **LOW** — stale / ignored / superseded

---

## gt-ims (GT-Ops) — WORST OFFENDER

| Workflow | Result | Severity | Notes |
|---|---|---|---|
| **Deploy to Vercel** | **0 success / 50 failure** (100% failure across ALL runs in last 100) | CRITICAL | Matches `feedback_vercel-autodeploy-broken.md` — GT-Ops Vercel auto-deploy is known broken, Clay deploys manually via `npx vercel --prod --yes`. Workflow continues firing on every push. |
| Shopify Order Sync | 24/24 success | OK | Healthy |
| Dependabot Updates | 8/8 success | OK | |
| VCTS Inventory Sync | 4/4 success | OK | |
| Intelligence Pipeline | 6/6 success | OK | |
| Kroger Price Sync | 6/6 success | OK | |
| Web Price Scrape | 0/1 failure | LOW | Single failure, may be one-off |
| Monthly Industry Digest | 1/1 success | OK | |

### Root cause (Deploy to Vercel)
Known broken workflow already documented. Every git push triggers a failed deploy. 
**Recommendation:** either delete the workflow file or fix the Vercel token/link. 
50 failed runs in recent history = 50 red noise notifications.

---

## mainline-apps — SECOND WORST

| Workflow | Result | Severity | Notes |
|---|---|---|---|
| **Deploy to Vercel** | 0 success / 25 failure / 1 cancelled (100% fail rate) | CRITICAL | ESLint config broken: `Cannot find module 'next/dist/compiled/babel/eslint-parser'`. `npm run guard:appledouble && eslint .` crashes at `Preflight` step. |
| **Glossy Sports EAS Build** | 0/3 failure | HIGH | `The bearer token is invalid` at `eas build`. Expired EXPO_TOKEN. |
| **Refresh Automation Readiness** | 0/2 failure | HIGH | Already known; `refresh-readiness.yml` — the bug that started this audit. `Input required and not supplied: token` (missing GH_PAT) at checkout step. Already moved to Marketing Automation / mainline-apps fix. |
| **Game Sync** | 0 success / 16 failure (100% fail rate) | HIGH | All 16 recent runs failed — spans March 2026, workflow has NEVER succeeded in visible window. |
| **Security Scan** | 16 success / 12 failure | MEDIUM | Flaky — roughly 57% success. Mixed pass/fail indicates intermittent issue, not total breakage. |
| **Marketing Automation** | 4 success / 1 failure | OK | **Healthy post-migration.** Was 1 failure before fix, now mostly green. |
| **Nightly Roster Sync** | 11 success / 3 failure | MEDIUM | Mostly green, occasional failure. Acceptable but worth watching. |
| Dependabot Updates | 6/6 success | OK | |

### Root causes
- **Deploy to Vercel:** eslint-parser not installed. Either `next` or `@babel/eslint-parser` missing from dashboard workspace deps. Every push → red notification.
- **Glossy Sports EAS Build:** `EXPO_TOKEN` secret is expired/revoked. Last 3 attempts all failed at auth step.
- **Game Sync:** needs dedicated investigation — 16 consecutive failures spanning at least 2 weeks. SidelineIQ game roster data not refreshing.

---

## sidelineiq — ALL MOBILE CI BROKEN

| Workflow | Result | Severity | Notes |
|---|---|---|---|
| **Validate Apps** | **0 success / 40 failure (NEVER SUCCEEDED)** | HIGH | `bash: ../../../scripts/appledouble-guard.sh: No such file or directory`. npm test script references a relative path that doesn't exist in monorepo layout. |
| **Type Check** | 25 success / 22 failure | HIGH | `npm audit --audit-level=critical` exits non-zero due to 1 critical + 9 high vulns in dev dependencies (jest-environment-jsdom chain). Fails on any push where audit regresses. |
| **EAS Build** | 0 success / 4 failure / 1 cancelled (NEVER SUCCEEDED) | CRITICAL | `Failed to resolve plugin for module "expo-router"`. Missing node_modules at build step — `expo config --json` can't resolve plugins. Mobile app CANNOT ship via CI. |
| Dependabot Updates | 8/8 success | OK | |

### Root causes
- **Validate Apps:** broken path to `appledouble-guard.sh` — likely survived a directory move. The file exists at a different level.
- **Type Check:** audit-level=critical gate + vulnerable transitive deps = permanent red. Either bump deps or lower gate.
- **EAS Build:** monorepo config issue — `npx expo config` can't find expo-router plugin. Classic EAS monorepo hoisting bug (see `expo-monorepo-eas-build` skill in memory).

---

## dosie — MIXED

| Workflow | Result | Severity | Notes |
|---|---|---|---|
| **Deploy to Vercel** | 13 success / 26 failure / 3 cancelled | HIGH | 67% failure rate. Mix of CSP, Resend, rebrand-era failures. Recent runs (past 2 weeks) trending better. |
| **EAS Build** | 0/2 failure | HIGH | Same `expo-router plugin not resolved` bug as sidelineiq. Never succeeded. |
| Dependabot Updates | 55/56 success | OK | |

### Root causes
- **EAS Build:** same Expo monorepo plugin-resolution issue as sidelineiq (both are in Clay's expo monorepo pattern).
- **Deploy to Vercel:** older failures were during Dosie → Tended rebrand. Worth a spot-check of the most recent runs to see if it's actually fixed or still flaky.

---

## menu-autopilot — CRITICAL

| Workflow | Result | Severity | Notes |
|---|---|---|---|
| **Deploy to Vercel** | **0 success / 48 failure (NEVER SUCCEEDED in visible window)** | CRITICAL | `npm ci` fails: lockfile/package.json desync. Dependabot PRs keep bumping `@types/node` to `25.5.2` but lockfile has `20.19.35`. Every push AND every dependabot PR fails. |
| Dependabot Updates | 8 success / 2 failure | LOW | Mostly OK |

### Root cause
`package-lock.json` is out of sync with `package.json`. Dependabot bumps package.json but lockfile isn't regenerated. Need to either (a) run `npm install` and commit updated lock, or (b) change workflow to use `npm install` instead of `npm ci`.

---

## infrastructure — MOSTLY OK

| Workflow | Result | Severity | Notes |
|---|---|---|---|
| Nightly Agent Review | 5 success / 3 failure | MEDIUM | 60% success. Recent failures before the fix-the-GH-App-token commit. Since `ci: replace GH_PAT with GitHub App auth` commit, green. |
| **Meta Ads Heartbeat** | 0 success / 0 failure / 49 SKIPPED | LOW | All 49 recent runs SKIPPED. Likely conditional skip due to env var check. Worth verifying whether this is intentional (Meta app in review) or broken. |
| Social Publisher | 41/41 success | OK | Healthy |
| **Marketing Automation** | **0/2 failure** | LOW (legacy) | These are from BEFORE the migration to mainline-apps. Error: `Bad credentials` cross-repo clone to mainline-apps. Now dead code — workflow should be deleted from infrastructure repo since it moved to mainline-apps. |

### Root cause
- **Marketing Automation in infrastructure/**: orphaned workflow that cross-clones mainline-apps with stale PAT. Fixed by moving to mainline-apps on 2026-04-09 but the OLD workflow file is still in infrastructure repo and still firing. **Delete it.**
- **Meta Ads Heartbeat skipped**: needs investigation — is this waiting on Meta Ads Management approval or genuinely broken?

---

## assetpulse — RECENTLY FIXED

| Workflow | Result | Severity | Notes |
|---|---|---|---|
| Build and Upload to TestFlight | last 2 success, 7 prior failures | LOW | Active development iteration on 2026-04-09 — signing/orientation/App Groups fixes. Now green. Not an audit concern. |

---

## gt-shopify-theme — FUNCTIONING

| Workflow | Result | Severity | Notes |
|---|---|---|---|
| dr-shopify-export | 2/2 success | OK | Healthy (new 2026-04-10 workflow) |
| forbidden-claims | 6 success / 2 failure | LOW | The 2 failures were intentional TEST trips ("TEST: trip guardrail to verify notify path (will revert)") — not real failures. |

---

## gt-website — STALE

| Workflow | Result | Severity | Notes |
|---|---|---|---|
| Type Check | 11 success / 0 failure (last run 2026-02-24) | LOW | No pushes for 6+ weeks. Stale but healthy. Not a concern. |
| Dependabot Updates | 2 failure / 6 success | LOW | 2 dependabot action bumps failed; non-blocking. |

---

## scout — STALE

| Workflow | Result | Severity | Notes |
|---|---|---|---|
| Type Check | all runs in Feb 2026, all green | LOW | Has `typecheck.yml` but no pushes since Feb 24. Dormant. |

---

## Repos with NO workflow runs / no workflows

| Repo | State | Severity |
|---|---|---|
| **the-immortal-snail** | No `.github/` directory at all. ZERO workflows configured. | LOW — intentional? or should have EAS/App Store CI? Consider adding. |
| **reps** | No `.github/` directory. ZERO workflows. | LOW — new/empty repo. |
| **projects-governance** | No `.github/` directory. ZERO workflows. | LOW — docs repo, probably intentional. |
| **gt-shopify-backup** | Zero runs returned. Probably no workflows or private token issue. | LOW |
| **agent-config-template** | Does not exist under clayparrish-cyber. | N/A |
| **agent-reports** | Does not exist under clayparrish-cyber. | N/A |

---

## Summary Stats

- **Repos scanned:** 14 (of 16 requested; 2 don't exist)
- **Broken workflows (≥3 consecutive failures OR 100% fail rate):** 12
- **CRITICAL-severity workflows:** 5
  1. gt-ims / Deploy to Vercel (50 consecutive failures)
  2. mainline-apps / Deploy to Vercel (25 consecutive failures — lint config)
  3. menu-autopilot / Deploy to Vercel (48 consecutive failures — lockfile desync)
  4. sidelineiq / EAS Build (0 successes ever — monorepo plugin issue)
  5. sidelineiq / Validate Apps (0 successes ever — script path broken)
- **HIGH-severity:** 6 more (mainline-apps Game Sync, Glossy Sports EAS, Refresh Readiness; sidelineiq Type Check; dosie Deploy to Vercel, EAS Build)
- **Legacy / to delete:** infrastructure / Marketing Automation (moved to mainline-apps, old workflow still firing)

## Worst Repos (by # of broken workflows)
1. **mainline-apps** — 4 broken + 1 flaky
2. **sidelineiq** — 3 broken (all mobile CI dead)
3. **gt-ims** — 1 very broken (50 consecutive fails, but it's known)
4. **menu-autopilot** — 1 very broken (48 consecutive fails)
5. **dosie** — 2 broken
