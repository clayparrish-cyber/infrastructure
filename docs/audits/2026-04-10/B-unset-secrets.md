# Audit B: Unset Secret References in GitHub Actions Workflows

**Date:** 2026-04-10
**Scope:** 14 repos in `clayparrish-cyber` org
**Trigger:** On 2026-04-09, `mainline-apps` was discovered silently failing because workflows referenced `secrets.GH_PAT` which was never set. This audit finds every similar class of bug.

## Methodology

1. Enumerated `.github/workflows/*.yml` for each repo (local + remote via `gh api`).
2. Extracted every `secrets.X` reference with file + line number.
3. Pulled `gh secret list` for each repo (checked `--env` where environments existed — none had env-scoped secrets).
4. Cross-referenced. `GITHUB_TOKEN` excluded (auto-injected).

## Repos With No Workflows / No `.github/` Directory

These are not at risk: **gt-shopify-backup**, **the-immortal-snail**, **projects-governance**, **reps**, **gt-website** (has `.github/` but no workflows dir).

## Repos With Workflows But No Secret Refs

- **scout** (`typecheck.yml` only uses `GITHUB_TOKEN`-implicit checkout)
- **sideline-iq/test.yml** (same)

---

## Section 1: Referenced-But-Missing Secrets (BUGS)

### mainline-apps  — 7 missing secret refs (worst drift)

| Secret | Workflow | Line |
|---|---|---|
| `APPLE_SEARCH_ADS_ORG_ID` | marketing-automation.yml | 51 |
| `APPLE_SEARCH_ADS_KEY_ID` | marketing-automation.yml | 52 |
| `APPLE_SEARCH_ADS_CLIENT_ID` | marketing-automation.yml | 53 |
| `APPLE_SEARCH_ADS_TEAM_ID` | marketing-automation.yml | 54 |
| `APPLE_SEARCH_ADS_PRIVATE_KEY` | marketing-automation.yml | 55 |
| `APPLE_TEAM_TYPE` | glossy-eas-build.yml | 40 |
| `SYNC_API_KEY` | game-sync.yml | 29 |

**Impact:**
- `marketing-automation.yml`: 5 Apple Search Ads secrets unset — this workflow was the one rescued on 2026-04-09. The Meta/IG/Supabase env vars are all set, but Apple Search Ads env block will inject empty strings, so any ASA code path in the pipeline is silently broken.
- `game-sync.yml`: line 29 references `secrets.SYNC_API_KEY` as a Bearer token for the ESPN game sync edge function. Unset means the curl passes an empty Bearer and the edge function almost certainly 401s. **LIKELY SILENTLY BROKEN — CRITICAL.**
- `glossy-eas-build.yml`: `APPLE_TEAM_TYPE` unset. EAS usually tolerates empty team type (defaults to `COMPANY_OR_ORGANIZATION`), but this pattern is suspicious across three repos (see below).

### gt-ims  — 3 missing

| Secret | Workflow | Line |
|---|---|---|
| `GT_OPS_SESSION_TOKEN` | web-price-scrape.yml | 25 |
| `GT_OPS_SESSION_TOKEN` | kroger-sync.yml | 37 |
| `SLACK_BOT_TOKEN` | slack-sync.yml | 37 |
| `SLACK_CHANNEL_ID` | slack-sync.yml | 38 |

**Impact:**
- `GT_OPS_SESSION_TOKEN` unset — both web-price-scrape and kroger-sync push data back into the gt-ops app via authenticated session. Without the token, either the POST 401s or the workflow swallows the failure. **LIKELY SILENTLY BROKEN.**
- `slack-sync.yml` — `SLACK_BOT_TOKEN` and `SLACK_CHANNEL_ID` unset. Only `SLACK_WEBHOOK_URL` is set on the repo. This workflow cannot be functioning at all. **LIKELY SILENTLY BROKEN.**

### gt-shopify-theme  — 2 missing

| Secret | Workflow | Line |
|---|---|---|
| `MIRROR_REMOTE_URL` | dr-mirror.yml | 34, 57 |
| `BACKUP_REPO_TOKEN` | dr-shopify-export.yml | 42 |

**Impact:**
- `dr-mirror.yml`: DR mirroring to a secondary git remote — without `MIRROR_REMOTE_URL`, the push target is empty. Entire DR mirror is a no-op. **LIKELY SILENTLY BROKEN.**
- `dr-shopify-export.yml`: `BACKUP_REPO_NAME` is set, but `BACKUP_REPO_TOKEN` is not. Without the token, the backup cannot push to the backup repo. **LIKELY SILENTLY BROKEN — this is the theme backup pipeline.**

### infrastructure  — 2 missing

| Secret | Workflow | Line |
|---|---|---|
| `ANTHROPIC_ADMIN_API_KEY` | nightly-review.yml | 61 |
| `BUFFER_PROFILE_DOSIE` | social-publisher.yml | 60 |

**Impact:**
- `ANTHROPIC_ADMIN_API_KEY` — used only for Anthropic admin-API calls (usage/billing). Regular `ANTHROPIC_API_KEY` is set. Impact: any admin-API calls in nightly-review fail silently, but core review still runs.
- `BUFFER_PROFILE_DOSIE` — only `BUFFER_PROFILE_SIDELINEIQ` is set. Dosie side of the social publisher pipeline cannot be publishing. **LIKELY SILENTLY BROKEN for Dosie social posts.**

### sidelineiq  — 1 missing

| Secret | Workflow | Line |
|---|---|---|
| `APPLE_TEAM_TYPE` | eas-build.yml | 45 |

### dosie  — 1 missing

| Secret | Workflow | Line |
|---|---|---|
| `APPLE_TEAM_TYPE` | eas-build.yml | 43 |

**Impact (sidelineiq/dosie APPLE_TEAM_TYPE):** EAS normally tolerates an empty `APPLE_TEAM_TYPE` but this is a shared gap across mainline-apps/sidelineiq/dosie and is a tripwire if EAS ever starts requiring it. Low-risk but should be set to `COMPANY_OR_ORGANIZATION` across all three.

### Repos with zero gaps

**assetpulse**, **menu-autopilot** — all referenced secrets present.

---

## Section 2: Set-But-Unused Secrets (LOW PRIORITY CLEANUP)

### gt-ims
- `KROGER_CLIENT_ID`
- `KROGER_CLIENT_SECRET`

Note: `kroger-sync.yml` uses `GT_OPS_URL` + `GT_OPS_SESSION_TOKEN` to POST into gt-ops (which then uses the Kroger creds server-side). The Kroger secrets are probably leftover from an earlier direct-auth design. Safe to remove from GH Actions (verify they exist in Vercel env first).

### infrastructure
- `GEMINI_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`

Both of these are not referenced in any infra workflow. `GEMINI_API_KEY` may be a preemptive provisioning; `NEXT_PUBLIC_SUPABASE_URL` is odd because other workflows use `SUPABASE_URL`. Could be leftover from an earlier naming convention. Both low priority.

### All other repos
- **mainline-apps** — no unused secrets; every set secret is referenced somewhere.
- **dosie, sidelineiq, gt-shopify-theme, assetpulse, menu-autopilot** — no unused secrets.

---

## Summary Counts

| Repo | Gaps | Unused | Priority |
|---|---|---|---|
| mainline-apps | **7** | 0 | HIGH (SYNC_API_KEY almost certainly broken) |
| gt-ims | **4** | 2 | HIGH (slack-sync 100% broken, 2x GT_OPS_SESSION_TOKEN broken) |
| gt-shopify-theme | **2** | 0 | HIGH (both DR workflows broken) |
| infrastructure | **2** | 2 | MEDIUM (Dosie Buffer broken; Anthropic admin cosmetic) |
| sidelineiq | **1** | 0 | LOW (APPLE_TEAM_TYPE tripwire) |
| dosie | **1** | 0 | LOW (APPLE_TEAM_TYPE tripwire) |
| assetpulse | 0 | 0 | clean |
| menu-autopilot | 0 | 0 | clean |
| scout | 0 | 0 | clean |
| sideline-iq (nested test.yml) | 0 | 0 | clean |
| gt-website | n/a (no workflows) | — | — |
| gt-shopify-backup | n/a (no `.github/`) | — | — |
| the-immortal-snail | n/a (no `.github/`) | — | — |
| projects-governance | n/a (no `.github/`) | — | — |
| reps | n/a (no `.github/`) | — | — |

**Total gaps: 17 distinct referenced-but-missing secret references across 6 repos.**
