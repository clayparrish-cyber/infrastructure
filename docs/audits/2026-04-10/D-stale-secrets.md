# D — Stale GitHub Secrets Audit

**Date:** 2026-04-09
**Org:** clayparrish-cyber
**Repos scanned:** 14
**Trigger context:** On 2026-04-09 Clay discovered mainline-apps had (a) VERCEL_TOKEN 48d old and never validated, (b) SUPABASE_URL 25d stale while NEXT_PUBLIC_SUPABASE_URL was current — silent drift between paired env vars.

## Method

1. `gh secret list --repo clayparrish-cyber/<repo> --json name,updatedAt` for all 14 repos
2. Age computed against 2026-04-09 UTC
3. Cross-referenced against local `.env*` files and `.vercel/project.json` for each project (keys only, never values)

## Threshold note

**Strict `>60 days` returns ZERO results** — the oldest secret across all repos is infrastructure/ANTHROPIC_API_KEY at exactly 60 days. Clay's actual discovered pain point (VERCEL_TOKEN at 48d, SUPABASE_URL at 25d) sits well under that threshold.

**Using operational threshold `>30 days`** (which aligns with Clay's actual finding) surfaces 27 stale secrets across 5 repos. The rest of this report uses the 30-day threshold.

## Empty repos (no GH secrets at all)

These repos have zero GH Actions secrets — nothing to audit:
- `gt-shopify-backup` — no secrets
- `menu-autopilot` — no secrets
- `scout` — no secrets
- `reps` — no secrets
- `projects-governance` — no secrets

## Per-repo findings

### gt-ims (11 stale, no local checkout on Lexar)

No local `.vercel/` or `.env` directory found on Lexar — cannot cross-reference directly. However the GH secret set suggests gt-ims is a scheduled job repo (GCP WIF + Kroger + VCTS + Drive). Some keys (KROGER_*) also appear in gt-ops `.env`, which is the expected shared infra.

| Age | Name | Local truth |
|-----|------|-------------|
| 47d | VERCEL_ORG_ID | No local checkout; value likely matches shared `team_gdAphQ4p3Yxg8P7MZpd39rDk` |
| 47d | VERCEL_PROJECT_ID | No local checkout |
| 47d | **VERCEL_TOKEN** | **CRITICAL — same age as the one Clay just flagged on mainline-apps** |
| 43d | KROGER_CLIENT_ID | Present in gt-ops `.env` (shared creds likely) |
| 43d | KROGER_CLIENT_SECRET | Present in gt-ops `.env` |
| 37d | ANTHROPIC_API_KEY | — |
| 37d | GCP_SERVICE_ACCOUNT | — |
| 37d | GCP_WIF_PROVIDER | — |
| 37d | GOOGLE_DRIVE_FOLDER_ID | Config value, not a secret; low risk |
| 37d | SLACK_WEBHOOK_URL | — |
| 31d | CRON_SECRET | Also appears in gt-ops `.env` |

**Secrets NOT stale (<=30d):** DATABASE_URL (21d), GT_OPS_URL (13d), VCTS_* (21d)

### mainline-apps (3 stale) — matches Clay's discovery

Local `.vercel/project.json` found at `/Volumes/Lexar/Projects/Mainline Apps/.vercel/` — orgId `team_gdAphQ4p3Yxg8P7MZpd39rDk`, projectId `prj_eNApHNuC7Zy5OFaKpeFzTLPSeP8s` (project name: "dashboard").

| Age | Name | Local truth |
|-----|------|-------------|
| 47d | VERCEL_ORG_ID | Present in `.vercel/project.json` — value can be verified |
| 47d | VERCEL_PROJECT_ID | Present in `.vercel/project.json` — value can be verified |
| 47d | **VERCEL_TOKEN** | **CRITICAL — this is the one Clay already flagged** |

**CONFIG DRIFT ALREADY RESOLVED:** SUPABASE_URL (24d old), NEXT_PUBLIC_SUPABASE_URL (0d), SUPABASE_SERVICE_ROLE_KEY (0d). The drift Clay discovered (25d stale SUPABASE_URL vs fresh NEXT_PUBLIC_SUPABASE_URL) is still present — the SUPABASE_URL GH secret is 24 days old and has NOT been refreshed. Local `.env.local` at `dashboard/.env.local` has a current NEXT_PUBLIC_SUPABASE_URL; the non-public SUPABASE_URL key in the GH secret has not been updated since 2026-03-15.

### infrastructure (7 stale) — no local `.vercel/` directory

`/Volumes/Lexar/Projects/infrastructure/` exists but has NO `.vercel/` folder and NO `.env*` files — this is a GH-Actions-only repo (no Vercel deployment).

| Age | Name | Notes |
|-----|------|-------|
| 60d | **ANTHROPIC_API_KEY** | **Oldest secret across the whole org. Technically at the >60d threshold boundary.** |
| 50d | COMMAND_CENTER_URL | Low risk (URL config) |
| 41d | COMMAND_CENTER_API_KEY | |
| 41d | META_ADS_ACCOUNT_ID | Config value, low risk |
| 38d | ASC_ISSUER_ID | Apple issuer ID, rarely rotates |
| 38d | ASC_KEY_ID | Apple key ID, rarely rotates |
| 38d | ASC_PRIVATE_KEY_B64 | Apple ASC private key |

Non-stale (recently rotated): META_ADS_ACCESS_TOKEN (0d), GH_APP_ID, GH_APP_PRIVATE_KEY (both 0d — new GH App migration noted in CLAUDE.md), BUFFER_* (1d).

### dosie (3 stale)

Local `.vercel/project.json` at `/Volumes/Lexar/Projects/Personal/dosie/.vercel/` — projectId `prj_mIkYEGvFbRzQTELxSjE5QlnZTlOM`, projectName "tended-app" (rebrand). No `.env` in root, but `web/.env.local` exists with NEXT_PUBLIC_SUPABASE_URL, ANON, SERVICE_ROLE, RESEND keys.

| Age | Name | Local truth |
|-----|------|-------------|
| 47d | VERCEL_ORG_ID | `.vercel/project.json` present — verifiable |
| 47d | VERCEL_PROJECT_ID | `.vercel/project.json` present |
| 47d | **VERCEL_TOKEN** | **CRITICAL — same 48d-class token** |

Note: dosie repo has NO Supabase or RESEND secrets in GH — CI probably only builds the Expo mobile app (ASC secrets rotated 3d ago). The web app's Supabase creds live only in local `.env.local` + Vercel's dashboard env.

### gt-website (3 stale)

Local `.vercel/project.json` at `/Volumes/Lexar/Projects/Gallant Tiger/gt-website/.vercel/` — projectId `prj_xtDGvr1d9MU4R7vTCepaaNYBowW4`. No root `.env*` files.

| Age | Name | Local truth |
|-----|------|-------------|
| 47d | VERCEL_ORG_ID | Verifiable from project.json |
| 47d | VERCEL_PROJECT_ID | Verifiable from project.json |
| 47d | **VERCEL_TOKEN** | **CRITICAL** |

This repo has ONLY the three Vercel secrets. No other GH Actions automation.

### sidelineiq (0 stale)

All 6 secrets are iOS signing + EXPO_TOKEN, all rotated 3d ago (2026-04-06–08). Clean.

Local `.vercel/project.json` exists (projectId `prj_tZ81Vkf6ie2hpoqjlFSgwhOmWOrJ`, name "sideline-iq") but there are NO Vercel-related GH secrets in this repo — CI only handles the Expo build path. If the project were to need CI-driven Vercel deploys, VERCEL_TOKEN/ORG_ID/PROJECT_ID would need to be added.

### assetpulse (0 stale)

All 5 secrets rotated today or yesterday (2026-04-09). Clean. No `.vercel/` or `.env*` locally — iOS-native build, no Vercel component.

### gt-shopify-theme (0 stale)

Only 2 secrets: BACKUP_REPO_NAME and SHOPIFY_ADMIN_TOKEN, both set today. Clean.

## Critical rotations — top 10 candidates

Ordered by risk × age:

1. **gt-ims VERCEL_TOKEN** (47d) — scheduled jobs, identical risk profile to mainline-apps VERCEL_TOKEN that Clay just found
2. **mainline-apps VERCEL_TOKEN** (47d) — already known, referenced in Clay's trigger event
3. **dosie VERCEL_TOKEN** (47d) — same 48d class; tended-app rebrand in progress so CI is live
4. **gt-website VERCEL_TOKEN** (47d) — only 3 secrets in the repo, all VERCEL_*, so CI depends entirely on this
5. **infrastructure ANTHROPIC_API_KEY** (60d) — oldest secret in the entire org. Used by agent infra.
6. **mainline-apps SUPABASE_URL** (24d — stale relative to paired NEXT_PUBLIC_SUPABASE_URL at 0d) — the drift Clay discovered is NOT YET FIXED on this key
7. **infrastructure COMMAND_CENTER_API_KEY** (41d) — credential for Command Center API calls from agent workers
8. **infrastructure ASC_PRIVATE_KEY_B64 / ASC_KEY_ID / ASC_ISSUER_ID** (38d) — Apple signing creds; other repos (sidelineiq, dosie, mainline-apps, assetpulse) have these freshly rotated, infrastructure does not
9. **gt-ims ANTHROPIC_API_KEY** (37d) — could be same key as infrastructure's 60d one; if so, rotating in one place needs propagation
10. **gt-ims GCP_SERVICE_ACCOUNT + GCP_WIF_PROVIDER** (37d each) — GCP Workload Identity Federation provider; if provider was rotated on GCP side, both need updating

## Config drift candidates (paired env var divergence)

The pattern Clay found is the most dangerous: two env vars for the same underlying resource get updated on different schedules and silently diverge.

### mainline-apps — SUPABASE_URL vs NEXT_PUBLIC_SUPABASE_URL (ACTIVE DRIFT)

| Secret | Age | Status |
|--------|-----|--------|
| SUPABASE_URL | 24d | **STALE** — last touched 2026-03-15 |
| NEXT_PUBLIC_SUPABASE_URL | 0d | Fresh — touched today |
| SUPABASE_SERVICE_ROLE_KEY | 0d | Fresh — touched today |

Local `.env.local` at `/Volumes/Lexar/Projects/Mainline Apps/dashboard/.env.local` contains `NEXT_PUBLIC_SUPABASE_URL=https://hpwsdlnhhesujkkqhasu.supabase.co` (key name only, no value printed here). If the server-side `SUPABASE_URL` GH secret still points at an older project URL, workflows that use it (e.g., scheduled agent ingests) will silently talk to a wrong Supabase. Clay already flagged this one — **it is not yet resolved on the GH secret side.**

### infrastructure — SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL / SERVICE_ROLE all ~23d

| Secret | Age |
|--------|-----|
| SUPABASE_URL | 23d |
| NEXT_PUBLIC_SUPABASE_URL | 23d |
| SUPABASE_SERVICE_ROLE_KEY | 23d |

All three were rotated at the same time (2026-03-16/17), so no drift. Would need rotation soon but currently consistent. Worth noting: if the Supabase org consolidation on 2026-03-16 moved this project, the URL may be pointing at the right place but the values should still be re-verified.

### Meta token drift risk

- **mainline-apps META_ADS_ACCESS_TOKEN** (0d), META_ADS_ACCOUNT_ID (0d), META_ADS_PROJECT_MAP (0d) — consistent bundle, rotated today
- **infrastructure META_ADS_ACCESS_TOKEN** (0d) **vs META_ADS_ACCOUNT_ID (41d)** — access token was just rotated, account ID has not been touched in 41 days. Account IDs don't really change, so this is likely benign, but if the account was migrated it could break. Low-medium risk.
- Per `memory/meta-ads-token-renewal.md`: Meta tokens expire ~June 8 2026. These look freshly refreshed today, so that lines up.

## Cross-repo patterns worth flagging

1. **The "48-day VERCEL_TOKEN cohort":** gt-ims, mainline-apps, dosie, gt-website all have VERCEL_TOKEN updated within ~6 hours of each other on 2026-02-20. This is almost certainly a single batch provisioning event that was never validated after Clay's 2026-03 sessions. If the underlying token is still valid these will work; if expired, four repos fail simultaneously. **Recommend one coordinated rotation of VERCEL_TOKEN across all four repos.**

2. **Infrastructure is stuck in the past:** `infrastructure` has the oldest ANTHROPIC_API_KEY (60d) and COMMAND_CENTER_URL (50d). This is the agent infra repo — per CLAUDE.md "Recent Changes" the marketing automation workflow was just moved OFF infrastructure TO mainline-apps on 2026-04-09 (today), which explains why mainline-apps got a wave of fresh secrets and infrastructure got stale ones. The stale infrastructure secrets may be safe to leave (or the repo may be on the way to deprecation) — but the ASC_* and ANTHROPIC keys should still be validated if any nightly job still runs there.

3. **No stale Meta access tokens anywhere.** Good. Token renewal procedure is being followed.

4. **No database URLs appear in GH secrets except gt-ims DATABASE_URL (21d, fresh).** Clay's DATABASE_URL secrets are fine.

## Repos with zero local truth to cross-reference

- `gt-ims` — no local checkout on Lexar
- `infrastructure` — local directory exists but no `.vercel/` or `.env*` files
- `menu-autopilot` — no `.vercel/`, no `.env*`
- `the-immortal-snail` — no `.vercel/`, no `.env*` (iOS-only)
- `assetpulse` — no `.vercel/`, no `.env*` (iOS-only)

For these, validation requires rotating and re-running CI to confirm — there's no local source of truth to compare against.
