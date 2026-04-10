# Clean-session audit + fix session — 2026-04-09 / 2026-04-10

**Scope:** Systematic sweep for the class of bugs discovered during the 2026-04-09
marketing automation rescue: workflows failing silently on unset secrets, missing
env vars, absolute local paths in committed files, and stale credentials.

**CC work items executed against:**
- `7098128c-510a-48fe-9bd6-ec303fb80c55` — Clean-session audit: hunt for bugs in the same class as the 2026-04-09 marketing/PAT findings
- `e562f730-5345-476f-aee6-1f293d4bc795` — Fix GT-Ops stale URL references and missing env vars (audit findings) — **partial, see below**
- `9901612c-9e32-493e-aa80-4f632a5f1329` — Evaluate forbidden-claims CI guardrail + branch protection for other private repos — **research done, rollout deferred**

## Audit reports (source of all findings)

Full per-stream reports under this directory:
- `A-workflow-failures.md` — `gh run list` sweep, 12 broken workflows identified
- `B-unset-secrets.md` — 17 `secrets.X` references pointing at nothing
- `C-absolute-paths.md` — 66 `/Volumes/Lexar/` and `/Users/clayparrish/` leaks in committed files
- `D-stale-secrets.md` — 27 GH secrets >30 days old
- `E-forbidden-claims-matrix.md` — per-repo evaluation for the forbidden-claims CI guardrail rollout
- `F-gt-ops-stale.md` — GT-Ops stale URLs + missing env vars (read-only, Shopify-adjacent findings flagged)

## Audit corrections discovered during execution

**Always verify audit findings against reality before fixing.** Several severity
claims were wrong:

1. **Audit A mainline-apps Deploy "babel/eslint-parser missing"** — actually TWO
   different failures: lockfile drift on Dependabot PR events, `babel-parser` lookup
   on push events. Deferred (Clay deploys manually).

2. **Audit C "dashboard server code has 5+ hardcoded paths"** — wrong severity.
   All three flagged `src/lib/server/*.ts` files already have defensive patterns:
   `if (process.env.VERCEL) return {...}` guards in `work-item-actions.ts`,
   portable-root-first + hardcoded-fallback in `marketing-review-packs.ts`,
   `fs.stat`-based candidate resolution in `queue-sweep-status.ts`. The paths
   never execute on Vercel. Not refactored — changing working code is pure risk.

3. **Audit D "mainline-apps SUPABASE_URL 24d stale, needs rotation"** — would
   have broken two workflows if blindly rotated. The unprefixed GH secret
   actually held the **GLOSSY** project URL (ref `ifraheqeskzpqvzvvlar`), not
   the dashboard URL. `game-sync.yml` and `nightly-roster-sync.yml` both read
   `secrets.SUPABASE_URL` for Glossy ESPN sync and roster sync. Rotating to
   match `NEXT_PUBLIC_SUPABASE_URL` (dashboard) would have pointed those
   workflows at the wrong Supabase project. Resolved with explicit disambiguation
   (see commit `99ceaf5` below).

4. **Audit D "dashboard SUPABASE_SERVICE_ROLE_KEY partial rotation"** — also
   wrong. Both local `.env.local` and Vercel production contained the same JWT
   (identical `iat=1773677661`, both `ref=hpwsdlnhhesujkkqhasu`). The 24d vs 0d
   "age" was a secret-set timestamp, not a key-issuance timestamp. The real
   issue was data corruption: Vercel's stored value had a literal `\n`
   (backslash-n, 2 chars) appended, making it 221 chars instead of the local
   219. Supabase client had been tolerating it silently. Fixed cosmetically,
   not an emergency rotation.

**Rule reinforced:** "Never guess, always verify." Audit tools surface signals,
not conclusions. Always trace what a flagged secret is actually used for and
what value it currently holds before changing anything.

## Commits pushed (14 total, 6 repos)

| # | Repo | SHA | Purpose |
|---|---|---|---|
| 1 | `mainline-apps` | `99ceaf5` | Disambiguate Glossy Supabase secrets + harden game-sync.yml command injection |
| 2 | `menu-autopilot` | `14688d2` | Initial lockfile regeneration (insufficient) |
| 3 | `menu-autopilot` | `05aa42c` | Add `preact: 10.24.3` override, full rm+install — `npm ci` now passes |
| 4 | `sidelineiq` | `d0aeb2f` | EAS Build workflow: add `npm ci`, harden `github.event.inputs.*` interpolation |
| 5 | `dosie` | `f5fbe91` | Same EAS fix + monorepo-root install (`working-directory: .`) |
| 6 | `sidelineiq` | `a999f4d` | Validate Apps: vendored `scripts/appledouble-guard.sh` into the repo (was relative-pathed to `/Volumes/Lexar/Projects/scripts/`, outside repo boundary) |
| 7 | `sidelineiq` | `b680ff3` | Added `GOOGLE_SERVICE_INFO_PLIST_B64` decode step (plist is gitignored) |
| 8 | `gt-ims` | `7ba7781` | Canonical domain drift: `gt-ops.vercel.app` → `ops.gallanttiger.com` in `next.config.ts` images, `src/lib/email.ts` logos + sendDay1Email fallback, `prisma/seed-library.ts` onboarding URL. **Zero Shopify files touched.** |
| 9 | `sidelineiq` | `8359dee` | (Superseded by 18f7913) Attempted drop of `ascApiKeyPath` from eas.json — EAS rejects this |
| 10 | `dosie` | `a2a204d` | Dropped `ascApiKeyPath` from eas.json (build-only, no --auto-submit, EAS doesn't validate) |
| 11 | `the-immortal-snail` | `3a01af4` | Dropped `ascApiKeyPath` from eas.json (same rationale) |
| 12 | `sidelineiq` | `18f7913` | **Correct fix:** repo-relative `ascApiKeyPath: ./AuthKey_9D66F38K8S.p8`, workflow decodes secret to that path, `AuthKey_*.p8` added to `.gitignore` |

## Non-commit state changes

1. **mainline-apps GH secrets:**
   - Created `GLOSSY_SUPABASE_URL` (= `https://ifraheqeskzpqvzvvlar.supabase.co`)
   - Created `GLOSSY_SUPABASE_SERVICE_ROLE_KEY` (piped from `supabase projects api-keys --project-ref ifraheqeskzpqvzvvlar`)
   - Deleted orphan `SUPABASE_URL` (ambiguous, pointed at Glossy but named like dashboard)
2. **mainline-apps Vercel production env:**
   - Cleaned up `SUPABASE_SERVICE_ROLE_KEY` data corruption (rm + add via `--value` flag; `--yes`+stdin pipe doesn't work in non-TTY mode, see gotcha below)
3. **sidelineiq GH secrets:**
   - Created `GOOGLE_SERVICE_INFO_PLIST_B64` (base64 of local `GoogleService-Info.plist`)

## Workflows now GREEN (were red)

- ✅ `mainline-apps/game-sync.yml` — **first successful run ever** (16/16 prior failures)
- ✅ `mainline-apps/nightly-roster-sync.yml` — preempted latent break (cron would have hit drifted key on next 2 AM UTC run)
- ✅ `dosie/eas-build.yml` — first success (npm ci added)
- ✅ `sidelineiq/Validate Apps` — first success after 40+ failures
- 🔄 `sidelineiq/eas-build.yml` — run `24225191349` in-progress as of session end; should go green now that `ascApiKeyPath` resolves
- 🔄 `menu-autopilot/deploy.yml` — `npm ci` step now passes; remaining typecheck errors are **pre-existing code debt**, not session-introduced (see "Deferred / not mine" below)

## Deferred / not mine / still-pending — pick up here

### Tier 1 / Tier 2 (safe, non-Shopify) — simple follow-ups

| Item | Source | Notes |
|---|---|---|
| `menu-autopilot` Prisma 7 typecheck errors | B (surfaced by 05aa42c) | `Module '@prisma/client' has no exported member 'PrismaClient'`, missing `html2canvas`/`jspdf`, implicit `any` on callbacks. Pre-existing, unblocked now that `npm ci` passes. Not a CI config fix — needs code changes. |
| `gt-ops` `.claude/commands/gt-inventory-health.md` + `gt-monday-briefing.md` | F | Hardcode `cd ~/Projects/Internal Systems/gt-ims` — path doesn't exist. Trivial string fix. |
| `gt-ops` `docs/finance-sheets/SETUP_GUIDE.md:58` | F | Says QBO redirect is `gt-ims.vercel.app/...`. Should verify Intuit portal has `ops.gallanttiger.com/...` and update doc. |
| `gt-ops` missing `.env.example` | F | Pure addition, no runtime impact. |
| `gt-ops` test fixture `shopify-enrich/__tests__/content-drift.test.ts` | E | Contains `"Made with high-oleic sunflower oil"` literal — test-only, but leaky. Part of forbidden-claims rollout (Audit E). |
| `gt-ops` `scripts/gt_investor_deck_builder.py:23` | C | Hardcoded Google Drive path. Local-only script, low priority. |
| `gt-ops` `docs/plans/2026-03-19-operational-flowchart-exec-summary.html` | C | Embeds `@font-face src: /Users/clayparrish/Library/Fonts/*.otf`. Silently falls back. Low priority. |
| `menu-autopilot/.claude/settings.local.json` tracked in git | C | Should be gitignored (Claude Code per-machine override). Single `git rm --cached` + `.gitignore` edit. |

### Tier 1/2 blocked on Clay input

| Item | What's needed | Source |
|---|---|---|
| `gt-ops` Vercel Production missing env vars | Decide which features are alive: `GOOGLE_MAPS_API_KEY`, `SLACK_WEBHOOK_URL`/`SLACK_BOT_TOKEN`/`SLACK_CHANNEL_ID`, `GOOGLE_SERVICE_ACCOUNT_KEY`+`GOOGLE_DRIVE_FOLDER_ID`, `OPENAI_API_KEY`, `VCTS_USERNAME`/`PASSWORD`/`PORTAL_URL`. Backfill only the live ones. Preview env is also nearly empty (only `GT_SESSION_SECRET` + `FIRECRAWL_API_KEY`). | F |
| `infrastructure` `BUFFER_PROFILE_DOSIE` | Need the actual Buffer profile ID for Dosie | B |
| `infrastructure` `ANTHROPIC_ADMIN_API_KEY` | Need a new admin key generated from Anthropic console | B |
| `gt-ims` `GT_OPS_SESSION_TOKEN` | Decide whether the two workflows using it (`web-price-scrape.yml`, `kroger-sync.yml`) are still live, and if so generate a new session token | B |
| `gt-ims` Slack sync workflow | Decide: set `SLACK_BOT_TOKEN` + `SLACK_CHANNEL_ID` or rewrite to use `SLACK_WEBHOOK_URL` (which IS set) | B |
| VERCEL_TOKEN batch rotation | Create new Vercel tokens in the Vercel dashboard for `mainline-apps`, `dosie`, `gt-website`, `gt-ims`. Audit D showed these were a single batch from 2026-02-20, never validated. Preventative, not reactive. | D |

### Tier 3 (Shopify-adjacent) — FROZEN until Clay explicitly approves per item

| Item | Source | Notes |
|---|---|---|
| `gt-shopify-theme` DR secrets | B finding #1 | `dr-mirror.yml` needs `MIRROR_REMOTE_URL` set, `dr-shopify-export.yml` needs `BACKUP_REPO_TOKEN` set. Both workflows currently no-op = theme DR is dead. **Clay needs to read both workflow files first to verify they're read-only on live theme before enabling.** |
| `gt-ops` Shopify store domain drift | F finding #27 | `src/lib/shopify.ts:6` code comment stale, `prisma/schema.prisma:2653` schema comment stale, `src/lib/public-site.ts:6` allowlist uses stale `gallant-tiger.myshopify.com`. Correct value per memory: `r90hdt-mv.myshopify.com`. **`public-site.ts` is runtime code — needs explicit Clay approval.** |
| `gt-ops` `SHOPIFY_WHOLESALE_CATALOG_ID` hardcoded default | F finding #28 | Default `gid://shopify/MarketCatalog/108619792541` in `shopify-admin.ts:10`. **Clay needs to verify current real catalog ID before touching.** |
| `gt-ims` `GT_OPS_URL` secret value | F finding #29 | Used by `shopify-order-sync.yml` (among others). Need to confirm value matches canonical `ops.gallanttiger.com` or legacy `gt-ims.vercel.app`. |

### Forbidden-claims CI guardrail rollout (Audit E)

Full matrix in `E-forbidden-claims-matrix.md`. Summary:

**Do now (Batch 1, ~2 hrs):**
1. `menu-autopilot` — highest compliance risk (AirTip tip/tax claims, weekly Resend emails with savings language)
2. `sideline-iq-landing` — LIVE, copy centralized in `src/lib/variants.ts`, brand-color regression history
3. `dosie` — use as **rebrand-completion enforcer** (21 `Dosie`/`dosie` stragglers still live in `apps/mobile/` across 10+ files), also health-claim guards ("diagnose", "cure", "medical advice" — med-reminder app has FDA/FTC exposure)

**Do next (Batch 2, ~1 hr):**
4. `sideline-iq` app — AI-generated curriculum in `content/*-generated.ts` needs AI-copy-tells guard
5. `glossy-sports` — monorepo `paths:` filter needed. Risks: "official PWHL/NHL app", "licensed data" (data is unofficial ESPN/HockeyTech → trademark exposure)

**Defer (narrow scope only):** `gt-ops` `shopify-enrich/`, `klaviyo.ts`, `email.ts` modules

**Skip:** `the-immortal-snail` (intentionally weird), `mainline-apps/dashboard` (internal, CF Access), `infrastructure` (use nightly content-value-review prompt instead)

**Dead candidate:** `agent-dashboard` doesn't exist as a standalone repo. Remove from future planning.

### Skipped entirely (wrong audit severity or working as designed)

- **Dashboard hardcoded `/Volumes/Lexar/` paths** (Audit C flagged as critical) — all three `src/lib/server/*.ts` files have defensive patterns, see "Audit corrections" section above.
- **mainline-apps `Deploy to Vercel` babel error** (Audit A flagged as critical) — Clay deploys manually via `vercel --prod --yes`. CI deploy is not a shipping blocker.

## Technical gotchas worth remembering

1. **`vercel env update/add` with stdin does not work in non-TTY mode.** In a
   scripted/piped context, even with `--yes`, stdin is ignored. The command
   reports "Added" or "Updated" success without actually reading the new value,
   leaving the old value in place. Use `--value "..." --force --yes` (value as
   command-line arg) when scripting. Costs shell history visibility once, but
   it's the only reliable non-interactive path.

2. **Supabase project has TWO classes of "stale secret" ages.** The GH secret
   `updated_at` timestamp records when the secret was last *set* (including
   being re-set with the same value). The JWT `iat` claim records when the
   JWT was *issued* by Supabase. These are different. A secret can show as
   "updated 0 days ago" in `gh secret list` while the JWT inside has an `iat`
   from weeks earlier. Always decode the JWT to know when the key was actually
   rotated. Both `anon` and `service_role` JWTs are public on the payload — only
   the signature is secret, so decoding is safe.

3. **EAS Build validates `ascApiKeyPath` must be in eas.json** for iOS submit
   profiles. You cannot drop the field and rely on `EXPO_ASC_API_KEY_PATH`
   env var alone — EAS rejects with "ascApiKeyPath, ascApiKeyIssuerId and
   ascApiKeyId must all be defined in eas.json". The workable pattern is a
   repo-relative path (`./AuthKey_*.p8`) with the file gitignored + CI workflow
   decoding the secret to that path before the build step. Build-only workflows
   (no `--auto-submit`) don't validate the submit profile so they can skip it.

4. **`gh secret set NAME < file`** DOES work via stdin in non-TTY mode (unlike
   `vercel env add`). No flag tricks needed. Pipe the value directly: `supabase
   projects api-keys --project-ref ... | awk '/pattern/ {print $field}' | gh
   secret set NAME -R org/repo`.

5. **Security hook on workflow edits** triggers on ANY edit to a
   `.github/workflows/*.yml` file regardless of what the edit actually does.
   When it fires, audit the file for pre-existing `${{ github.event.X }}`
   shell interpolation and route those through env vars as part of your edit
   to pass the hook. Usually a 2-for-1: fix the hook-blocker while also making
   your actual edit.

## Pick-up instructions for future sessions

When resuming this audit work, start by:

1. Read this `SESSION.md` top to bottom for context
2. Check CC work items `7098128c`, `e562f730`, `9901612c` for current status
3. Verify the audit reports in this same directory are still current by
   re-running the audit streams (A-F) — findings may have changed since 2026-04-10
4. Decide which of the "Pending" sections to tackle, in priority order:
   - Tier 3 Shopify-adjacent items need Clay's explicit per-item approval
   - Tier 1/2 blocked items need Clay to provide values
   - Tier 1/2 simple follow-ups can proceed without Clay input
5. When touching anything in GT / Shopify / gt-ops territory, re-read the
   safety tiers in this doc and stay in Tier 1 unless explicitly approved.
