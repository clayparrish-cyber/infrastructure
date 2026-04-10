# GT-Ops Stale URLs & Env Vars — Audit Findings

**Audit date:** 2026-04-10
**Auditor:** Claude Code (Opus 4.6), strict read-only mode
**Project:** `/Volumes/Lexar/Projects/Gallant Tiger/gt-ops/` (GitHub repo: `clayparrish-cyber/gt-ims`)
**Linked Vercel project:** `gt-ops` (prj_qRLfrxtfQfgwnW2ZjUwNrOUXs7qG, team clay-parrishs-projects)
**Global STATUS:** NEEDS CLAY REVIEW BEFORE ANY CHANGE
**Branch:** `main`, up to date with origin. Uncommitted: `CLAUDE.md` modified, one untracked plan doc.

## Context

Three candidate app URLs coexist in the codebase and all return HTTP 307 from the same app (they route through the login middleware):
- `https://gt-ops.vercel.app` — Vercel preview alias, still alive
- `https://gt-ims.vercel.app` — Legacy alias from when the project was named `gt-ims`, still alive
- `https://ops.gallanttiger.com` — **Canonical production domain** (aliased to `gt-34r46bymw-clay-parrishs-projects.vercel.app` 7 days ago per `vercel alias ls`)
- `https://gt-ops-brief.vercel.app` — **Separate Vercel project** (confirmed by alias list), returns HTTP 200 (public)

The important insight: the codebase doesn't have a single source of truth for "where is GT-Ops live?" Code, emails, docs, and workflows each pick a different URL, with `gt-ops.vercel.app` being the most common hardcoded fallback even though `ops.gallanttiger.com` is now canonical.

---

## FINDING 1 — Inconsistent canonical URL across runtime code (HIGH)

**Severity:** HIGH
**STATUS:** NEEDS CLAY REVIEW BEFORE ANY CHANGE

### Files

1. `/Volumes/Lexar/Projects/Gallant Tiger/gt-ops/src/lib/email.ts:174` — hardcoded `<img src="https://gt-ops.vercel.app/logo-stacked-offwhite.png">` inside an email template
2. `/Volumes/Lexar/Projects/Gallant Tiger/gt-ops/src/lib/email.ts:278` — same hardcoded logo URL in a second email template
3. `/Volumes/Lexar/Projects/Gallant Tiger/gt-ops/src/lib/email.ts:402` — `const gtOpsUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://gt-ops.vercel.app'` (fallback uses old URL)
4. `/Volumes/Lexar/Projects/Gallant Tiger/gt-ops/src/lib/email.ts:481` — hardcoded `<a href="https://gt-ops-brief.vercel.app">` (this is a separate project — intentional but worth confirming)
5. `/Volumes/Lexar/Projects/Gallant Tiger/gt-ops/src/app/api/auth/forgot-password/route.ts:71` — `const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://ops.gallanttiger.com'` (uses NEW canonical — inconsistent with email.ts fallback)
6. `/Volumes/Lexar/Projects/Gallant Tiger/gt-ops/src/app/api/integrations/quickbooks/callback/route.ts:7` — `return process.env.NEXT_PUBLIC_APP_URL || 'https://ops.gallanttiger.com'` (uses NEW canonical)
7. `/Volumes/Lexar/Projects/Gallant Tiger/gt-ops/prisma/seed-library.ts:152` — onboarding library seed row tells users "Log into gt-ops.vercel.app"
8. `/Volumes/Lexar/Projects/Gallant Tiger/gt-ops/scripts/gmail-auto-responder.gs:590` — auto-responder points users at `https://gt-ops.vercel.app/wholesale`
9. `/Volumes/Lexar/Projects/Gallant Tiger/gt-ops/src/lib/public-site.ts:4-6` — allowlist of GT customer-facing domains includes `https://gallanttiger.com`, `https://www.gallanttiger.com`, `https://gallant-tiger.myshopify.com` — this is Shopify-adjacent (see Finding 7)
10. `/Volumes/Lexar/Projects/Gallant Tiger/gt-ops/next.config.ts:21` — `images.remotePatterns` only whitelists `gt-ops.vercel.app`, NOT `ops.gallanttiger.com` — meaning any `<Image>` with a src on the production domain may fail optimization in production

### What's stale
The production domain was switched to `ops.gallanttiger.com` 7 days ago (per Vercel alias list). Two newer auth-related routes (`forgot-password`, `quickbooks/callback`) already know this. Email templates, seed data, scripts, and the Next image whitelist still default to `gt-ops.vercel.app`. When NEXT_PUBLIC_APP_URL is set in Vercel env this may be masked for live traffic, but: (a) customer-facing emails embed the literal string `gt-ops.vercel.app` for the logo `<img>` regardless of env var, and (b) next.config.ts remotePatterns is a build-time constant and wouldn't benefit from an env var anyway.

### Proposed fix (words only)
- Pick one canonical: `https://ops.gallanttiger.com` is the right answer per Vercel alias list and the two routes that already use it.
- Standardize every fallback/hardcode to the canonical, OR replace with `process.env.NEXT_PUBLIC_APP_URL` without a fallback and fail loud.
- Add `ops.gallanttiger.com` to `next.config.ts` `images.remotePatterns`. Keep `gt-ops.vercel.app` there too for preview deployments.
- Update `prisma/seed-library.ts` and `scripts/gmail-auto-responder.gs` to reference the branded domain.
- Email logo URLs inside templates: consider serving logos from `gallanttiger.com` or a CDN so they survive any future domain change.

### Shopify-adjacent risk
None direct, but `public-site.ts` lines 4-6 reference `gallant-tiger.myshopify.com` — DO NOT TOUCH without checking whether any current Shopify webhook/integration still depends on that allowlist entry.

---

## FINDING 2 — Dead/stale URLs in documentation (MEDIUM)

**Severity:** MEDIUM (docs only, but agents and team members may act on them)
**STATUS:** NEEDS CLAY REVIEW BEFORE ANY CHANGE

### Files
1. `/Volumes/Lexar/Projects/Gallant Tiger/gt-ops/docs/finance-sheets/SETUP_GUIDE.md:58` — says to keep `https://gt-ims.vercel.app/api/integrations/quickbooks/callback` as the redirect URI. Per code in `src/app/api/integrations/quickbooks/callback/route.ts:7` the canonical redirect is now `https://ops.gallanttiger.com/api/integrations/quickbooks/callback`. **This is potentially HIGH severity if the QuickBooks OAuth redirect URI registered in Intuit's portal is out of sync with Vercel's `QBO_REDIRECT_URI` env var.**
2. `/Volumes/Lexar/Projects/Gallant Tiger/gt-ops/docs/plans/2026-04-06-wholesale-flow-simplification.md:342,466` — references `https://gt-ims.vercel.app/api/wholesale/apply`
3. `/Volumes/Lexar/Projects/Gallant Tiger/gt-ops/docs/plans/2026-03-07-intelligence-pipeline-phase2-impl.md:615,652,758,761,764` — `APP_URL: https://gt-ims.vercel.app` and curl snippets
4. `/Volumes/Lexar/Projects/Gallant Tiger/gt-ops/docs/plans/2026-03-19-shopify-enrichment-remaining.md:36,41,127,128` — `GT_OPS_URL` GitHub secret documented as `https://gt-ims.vercel.app`. Current GitHub workflows (`.github/workflows/*.yml`) read `GT_OPS_URL` from secrets — **if the GitHub secret still contains `gt-ims.vercel.app`, those cron jobs may hit stale routes**. Flagged for verification of the actual GitHub secret value.
5. `/Volumes/Lexar/Projects/Gallant Tiger/gt-ops/docs/plans/2026-01-16-notification-system-design.md:213,246` — references `https://gt-ims.vercel.app/tasks`
6. `/Volumes/Lexar/Projects/Gallant Tiger/gt-ops/docs/onboarding/gt-ops-quickstart.txt:8` and `docs/onboarding/systems-guide.txt:15` — onboarding docs tell new hires to open `gt-ops.vercel.app` not `ops.gallanttiger.com`
7. `/Volumes/Lexar/Projects/Gallant Tiger/gt-ops/docs/plans/2026-01-15-crm-implementation.md:387` — references old path `/Users/clayparrish/Projects/Internal Systems/gt-ims` (current path is `/Volumes/Lexar/Projects/Gallant Tiger/gt-ops`)
8. `/Volumes/Lexar/Projects/Gallant Tiger/gt-ops/.claude/commands/gt-inventory-health.md:18` and `.claude/commands/gt-monday-briefing.md:18` — slash command shell invocations reference `cd ~/Projects/Internal\ Systems/gt-ims` — these slash commands will fail on any machine where the project has been moved to Lexar

### What's stale
`gt-ims.vercel.app` IS still alive (307s to login — aliased to the same Vercel project), so nothing is visibly broken for the user, but these docs and agent commands will eventually drift further and the `~/Projects/Internal Systems/gt-ims` path no longer exists.

### Proposed fix
- Global search-and-replace `gt-ims.vercel.app` → `ops.gallanttiger.com` in docs/**/*.md
- Fix `.claude/commands/gt-inventory-health.md` and `gt-monday-briefing.md` to use the current path or remove the hardcoded cd
- Manually verify the GitHub secret `GT_OPS_URL` actual value (not in scope for this read-only audit) — if it's `https://gt-ims.vercel.app` still, the nightly cron calls in `intel-pipeline.yml`, `kroger-sync.yml`, `shopify-order-sync.yml`, `web-price-scrape.yml` may be working only because Vercel is still honoring the old alias
- **For SETUP_GUIDE.md + QuickBooks**: verify Intuit developer portal has `ops.gallanttiger.com/api/integrations/quickbooks/callback` registered AND that the `QBO_REDIRECT_URI` Vercel env var matches. Mismatch here means QBO OAuth reconnects will fail.

### Shopify-adjacent risk
Low. Documentation-level only, no Shopify theme files referenced.

---

## FINDING 3 — `.github/workflows/intel-pipeline.yml` uses custom domain explicitly (INFO / MEDIUM)

**Severity:** MEDIUM
**STATUS:** NEEDS CLAY REVIEW BEFORE ANY CHANGE

### File
`/Volumes/Lexar/Projects/Gallant Tiger/gt-ops/.github/workflows/intel-pipeline.yml:34,73`

### What's there
```
APP_URL: https://ops.gallanttiger.com
```
This workflow IS using the new canonical domain — good. But other workflows (`shopify-order-sync.yml:4`, `web-price-scrape.yml:5`, `kroger-sync.yml:7`) reference `GT_OPS_URL` as a GitHub secret and comment `e.g. https://gt-ops.vercel.app`. Inconsistency: one workflow hardcodes the canonical, others pull from a secret whose actual value is not visible from this audit.

### Proposed fix
Pick one convention: either all workflows hardcode `ops.gallanttiger.com`, or all use `secrets.GT_OPS_URL` and you set the secret to `https://ops.gallanttiger.com`. Document the choice in `vercel-gotchas.md`.

### Shopify-adjacent risk
`shopify-order-sync.yml` hits Shopify Admin endpoints. DO NOT modify that workflow without verifying the GitHub Secret value first and understanding impact on order sync.

---

## FINDING 4 — Localhost fallbacks in server code paths (LOW)

**Severity:** LOW (env-guarded, dev-only in practice)
**STATUS:** NEEDS CLAY REVIEW BEFORE ANY CHANGE

### Files
1. `/Volumes/Lexar/Projects/Gallant Tiger/gt-ops/src/lib/google-auth.ts:24` — `'http://localhost:3000/api/auth/google/callback'` as terminal fallback after `GOOGLE_REDIRECT_URI`, `NEXT_PUBLIC_APP_URL`, and `VERCEL_URL` all missing
2. `/Volumes/Lexar/Projects/Gallant Tiger/gt-ops/src/app/api/admin/send-welcome/route.ts:46` — `'http://localhost:3000'` as terminal fallback after `NEXT_PUBLIC_APP_URL` and `VERCEL_URL` both missing

### What's stale
Not strictly stale — `VERCEL_URL` is auto-injected by Vercel so the fallback never fires in production. But if `NEXT_PUBLIC_APP_URL` gets unset AND there's a weird edge case where VERCEL_URL is empty (some cron/edge execution paths), the welcome email / Google OAuth redirect would embed `http://localhost:3000`.

### Proposed fix
Fail loudly instead of falling back to localhost: throw an error naming the missing env var. The existing `src/lib/env.ts` validator requires `NEXT_PUBLIC_APP_URL` in production already — so removing the localhost fallback would be a no-op in the happy path and a better failure mode in the edge cases.

### Shopify-adjacent risk
None.

---

## FINDING 5 — Env vars referenced in code but NOT in Vercel Production (HIGH)

**Severity:** HIGH — some of these throw hard errors when the code path is exercised
**STATUS:** NEEDS CLAY REVIEW BEFORE ANY CHANGE

### Methodology
- Extracted `process.env.X` references from `src/**/*` and `scripts/**/*` (41 unique vars)
- Listed Vercel Production env vars via `npx vercel env ls` (read-only): 28 variables
- Cross-referenced

### Missing from Vercel (Production) entirely but referenced in code that throws if they're absent

| Env var | Code location | Behavior if missing |
|---|---|---|
| `GOOGLE_MAPS_API_KEY` | `src/lib/google-maps.ts:50` | **Throws `'GOOGLE_MAPS_API_KEY is not set'`** — and `vercel.json` has a monthly cron for `/api/market-intel/google-maps` at `0 8 1 * *`. Cron is dead. |
| `SLACK_WEBHOOK_URL` | `src/lib/slack.ts:10` | **Throws `'SLACK_WEBHOOK_URL is not set'`** — any Slack notification path is dead |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | `src/lib/google-drive.ts:6` | Throws if Google Drive integration is invoked |
| `GOOGLE_DRIVE_FOLDER_ID` | `src/lib/google-drive.ts:29` | Throws same code path |
| `OPENAI_API_KEY` | `src/**` (referenced but I did not trace every usage) | Likely throws wherever it's used |
| `VCTS_USERNAME`, `VCTS_PASSWORD`, `VCTS_PORTAL_URL` | scripts and probably the vcts-inventory-sync workflow path | Workflow may be silently failing |
| `SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID` | `src/lib/slack.ts` (or similar) | Same as webhook — Slack-dependent features dead |
| `GOOGLE_REDIRECT_URI` | `src/lib/google-auth.ts:19` | Falls back via `NEXT_PUBLIC_APP_URL` — likely OK |
| `COLD_CHAIN_EMAIL` | `src/lib/warehouse-release.ts:34` | Has default `'operations@coldchain3pl.com'` — OK, but verify default is right |
| `GT_OPS_ALERT_RECIPIENT` | `src/lib/shopify-enrich/alerts.ts:5` | Has default `'clay@gallanttiger.com'` — OK |
| `SHOPIFY_WHOLESALE_CATALOG_ID` | `src/lib/shopify-admin.ts:10` | Has default `'gid://shopify/MarketCatalog/108619792541'` — **SHOPIFY-ADJACENT, see Finding 7** |

### Missing env vars that may NOT matter (gracefully handled)
- `NODE_ENV`, `VERCEL_URL` — runtime-injected by Vercel
- `COLD_CHAIN_EMAIL`, `GT_OPS_ALERT_RECIPIENT`, `SHOPIFY_WHOLESALE_CATALOG_ID` — have defaults

### Env vars in Vercel that I did NOT find as direct `process.env.X` references (but ARE used via helpers)
- `KLAVIYO_EMAIL_LIST_ID` — used via `getKlaviyoListId('KLAVIYO_EMAIL_LIST_ID')` in `src/app/api/newsletter/subscribe/route.ts:51`
- `KLAVIYO_WHOLESALE_LIST_ID` — used via helper in multiple route files

Both OK.

### Preview/Development gap
- `GT_SESSION_SECRET` is the only env var set for **all three** environments (Development, Preview, Production)
- `FIRECRAWL_API_KEY` is set for Development and Production but **NOT Preview** — preview deployments likely hit Firecrawl failures
- Every other 28-var Vercel entry is **Production-only** — meaning Preview deployments have zero env vars except `GT_SESSION_SECRET`, and `vercel env pull` for local dev pulls mostly nothing. This explains why `.env.vercel` only has 3 vars (`FIRECRAWL_API_KEY`, `GT_SESSION_SECRET`, `VERCEL_OIDC_TOKEN`)

### Proposed fix
1. Add missing vars (`GOOGLE_MAPS_API_KEY`, `SLACK_WEBHOOK_URL`, `SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID`, `GOOGLE_SERVICE_ACCOUNT_KEY`, `GOOGLE_DRIVE_FOLDER_ID`, `OPENAI_API_KEY`, `VCTS_USERNAME`, `VCTS_PASSWORD`, `VCTS_PORTAL_URL`) to Vercel Production env. Each one needs its real value — requires pulling from `.env.local` or reconstructing.
2. Duplicate the 28 Production vars into Preview so preview deploys can actually function. (Low priority but explains why previews look broken.)
3. Create a committed `.env.example` template so future audits and new contributors can diff what's needed. Currently there is NONE.
4. Verify the monthly `google-maps` cron (`vercel.json:28-30`) has actually been running — per memory `feedback_execute-dont-defer.md`, silent cron failures are a recurring issue.

### Shopify-adjacent risk
`SHOPIFY_WHOLESALE_CATALOG_ID` has a hardcoded default of `gid://shopify/MarketCatalog/108619792541`. **DO NOT change this default without cross-checking with the actual Shopify Markets catalog ID.** Report to Clay only — do not touch.

---

## FINDING 6 — No committed `.env.example` / `.env.sample` (MEDIUM)

**Severity:** MEDIUM
**STATUS:** NEEDS CLAY REVIEW BEFORE ANY CHANGE

### What's there
`git ls-files | grep -i env` in gt-ops returns only `src/lib/env.ts` (validator), `src/lib/env-utils.ts` (helper), `next-env.d.ts`. No `.env.example`, `.env.sample`, `.env.template`.

`.gitignore` blocks `.env` files with `# env files (can opt-in for committing if needed)` comment — the opt-in was never taken.

### Local env files (not committed, content not read per audit rules)
- `.env` — 24 lines
- `.env.local` — 48 lines
- `.env.vercel` — 4 lines (only FIRECRAWL_API_KEY, GT_SESSION_SECRET, VERCEL_OIDC_TOKEN — confirming the Preview-env gap)

### Proposed fix
Create a committed `.env.example` listing every env var name (no values) from the 41 code references, grouped by feature. This serves as the source-of-truth gap-detection template.

### Shopify-adjacent risk
None.

---

## FINDING 7 — Shopify-adjacent hardcoded references (FLAG ONLY, DO NOT TOUCH)

**Severity:** N/A — flagged for Clay
**STATUS:** NEEDS CLAY REVIEW BEFORE ANY CHANGE — STRICTLY DO NOT TOUCH

Per audit instructions, I am flagging all Shopify-adjacent references for your awareness but made no attempt to verify, edit, or follow their state.

1. `/Volumes/Lexar/Projects/Gallant Tiger/gt-ops/src/lib/shopify-admin.ts:6` — `const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN || 'r90hdt-mv.myshopify.com'` — matches memory file `gt-shopify-myshopify-domain.md` which says actual domain is `r90hdt-mv` not `gallanttiger`
2. `/Volumes/Lexar/Projects/Gallant Tiger/gt-ops/src/lib/shopify-admin.ts:10` — `SHOPIFY_WHOLESALE_CATALOG_ID` default `'gid://shopify/MarketCatalog/108619792541'`
3. `/Volumes/Lexar/Projects/Gallant Tiger/gt-ops/src/lib/shopify.ts:6` — `SHOPIFY_DOMAIN` comment says `"gallant-tiger.myshopify.com"` — comment disagrees with actual domain `r90hdt-mv.myshopify.com` elsewhere
4. `/Volumes/Lexar/Projects/Gallant Tiger/gt-ops/prisma/schema.prisma:2653` — `shopDomain String @unique // e.g. "gallant-tiger.myshopify.com"` — schema comment uses the stale name
5. `/Volumes/Lexar/Projects/Gallant Tiger/gt-ops/src/lib/public-site.ts:4-6` — allowlist includes `'https://gallant-tiger.myshopify.com'` (the stale name, not `r90hdt-mv`)
6. `/Volumes/Lexar/Projects/Gallant Tiger/gt-ops/src/lib/competitors/shopify-traffic.ts:121,192` — `domain: 'gallanttiger.com'` (this is the customer-facing domain, OK — but flagged because it's in a Shopify-related file)
7. `/Volumes/Lexar/Projects/Gallant Tiger/gt-ops/src/lib/shopify-enrich/content-drift.ts:130` — builds URLs like `https://gallanttiger.com/${r.type === 'page' ? 'pages' : 'blogs/news'}/${r.handle}` — uses customer domain, OK
8. `/Volumes/Lexar/Projects/Gallant Tiger/gt-ops/docs/onboarding/systems-guide.txt:24` — references `admin.shopify.com/store/gallant-tiger` (admin URL path)
9. Cron entries in `/Volumes/Lexar/Projects/Gallant Tiger/gt-ops/vercel.json:35-46` for `shopify-customer-sync`, `shopify-content-drift`, `shopify-theme-audit` — these hit Shopify Admin API regularly. Any change to `SHOPIFY_STORE_DOMAIN` breaks them.

### What might be wrong (but I will NOT verify or touch)
The comment in `src/lib/shopify.ts:6` says `gallant-tiger.myshopify.com` but the hardcoded fallback in `src/lib/shopify-admin.ts:6` says `r90hdt-mv.myshopify.com`. Per memory, `r90hdt-mv` is correct. The `public-site.ts:6` allowlist uses the stale name — this could mean public-site CORS / referrer checks are letting in a stale domain, OR blocking the real one. **Needs Clay to check.**

### Proposed fix
Out of scope for this audit. Clay to decide whether to:
(a) make `r90hdt-mv.myshopify.com` a single source of truth (a constant or env var) and reference it everywhere, or
(b) retire the `.myshopify.com` references entirely in favor of `gallanttiger.com`

---

## FINDING 8 — Dead type validator references to deleted routes (LOW)

**Severity:** LOW (build-time only, self-healing on next build)
**STATUS:** NEEDS CLAY REVIEW BEFORE ANY CHANGE

### Files
Stale generated type file:
- `/Volumes/Lexar/Projects/Gallant Tiger/gt-ops/.next/dev/types/validator.ts:341` — references `src/app/(dashboard)/leadership/page.js` (does not exist)
- `/Volumes/Lexar/Projects/Gallant Tiger/gt-ops/.next/dev/types/validator.ts:1115` — references `src/app/api/dashboard/leadership/route.js` (does not exist)
- `/Volumes/Lexar/Projects/Gallant Tiger/gt-ops/.next/dev/types/validator.ts:1295` — references `src/app/api/integrations/shopify/oauth/route.js` (only the `callback` subdir exists)

### What's stale
Next.js dev-time generated validator has stale entries. These are in `.next/` which is in `.gitignore`, so they self-heal on `rm -rf .next && npm run build`. No committed code is affected.

### Proposed fix
Delete `.next/` before next local dev run. Zero risk.

### Shopify-adjacent risk
The third entry references a `shopify/oauth/route.js` — the actual source file `src/app/api/integrations/shopify/oauth/route.ts` does NOT exist (only `src/app/api/integrations/shopify/oauth/callback/route.ts` exists). That's fine — the validator is just stale. But it might mean at some point a `shopify/oauth` top-level route was planned and deleted, leaving `callback` orphaned. Worth a glance.

---

## FINDING 9 — Vercel `deploy.yml` auto-deploy (MEDIUM — already known)

**Severity:** MEDIUM (known per `feedback_vercel-autodeploy-broken.md`)
**STATUS:** NEEDS CLAY REVIEW BEFORE ANY CHANGE

### File
`/Volumes/Lexar/Projects/Gallant Tiger/gt-ops/.github/workflows/deploy.yml`

This workflow attempts `vercel --prod --yes --token=$VERCEL_TOKEN` on push to main, BUT per `feedback_vercel-autodeploy-broken.md` Clay has confirmed it never fires reliably and always runs `npx vercel --prod --yes` manually.

The workflow file itself looks syntactically correct. Not investigated WHY it silently fails (Vercel webhook layer, secret mismatch, job concurrency, etc.) — out of scope for a read-only audit.

### Proposed fix
Out of scope. Flagged so the audit captures that this is a known-broken piece of infrastructure.

### Shopify-adjacent risk
None direct.

---

## Summary table

| # | Finding | Severity | Shopify-adjacent? |
|---|---|---|---|
| 1 | Inconsistent canonical URL in runtime code (emails, seeds, next.config images) | HIGH | Soft (public-site.ts allowlist) |
| 2 | Stale `gt-ims.vercel.app` in docs + onboarding + `.claude/commands/*` paths | MEDIUM | No |
| 3 | Inconsistent `APP_URL` convention across GitHub workflows | MEDIUM | `shopify-order-sync.yml` — DO NOT TOUCH |
| 4 | `localhost:3000` fallbacks in `google-auth.ts` and `send-welcome/route.ts` | LOW | No |
| 5 | 10+ env vars referenced in code are missing from Vercel Production (cron dead, Slack dead, Google Maps dead) | HIGH | `SHOPIFY_WHOLESALE_CATALOG_ID` default — DO NOT TOUCH |
| 6 | No committed `.env.example` to anchor future audits | MEDIUM | No |
| 7 | Shopify store domain drift (`gallant-tiger` vs `r90hdt-mv`) across files | FLAG ONLY | **YES — DO NOT TOUCH** |
| 8 | Dead `.next/dev/types/validator.ts` entries for deleted routes | LOW | Tangential |
| 9 | Vercel auto-deploy via `.github/workflows/deploy.yml` — known broken | MEDIUM | No |

## Nothing to report on
- **Supabase URLs** — grep returned zero `*.supabase.co` matches. gt-ops uses PostgreSQL directly (`DATABASE_URL`, likely Neon based on CSP `connect-src 'self' https://*.neon.tech`). So the 2026-03-16 Supabase org consolidation has no impact on gt-ops.
- **Broken imports** — typecheck surfaced type errors in `src/app/api/contact/submit/route.ts:248` (readonly tuple assignment) and `src/components/competitors/competitor-detail-client.tsx` (Recharts v3 API drift: 976, 1019, 1038) — but NOT stale imports. These are genuine TS errors masked by `typescript.ignoreBuildErrors: true` in `next.config.ts:10`. Not in scope for this audit but worth noting.

---

## Out of scope but worth Clay's attention
1. **`/tmp/audit-2026-04-10/_secrets-raw.txt`** — a file already existed in `/tmp/audit-2026-04-10/` when I created the directory. I did NOT read it (per audit rules) but its presence suggests a prior session left a secrets file on disk. Recommend deletion.
2. `next.config.ts:10` sets `typescript.ignoreBuildErrors: true` with a TODO comment about Vercel Hobby tier memory. The type errors surfaced in the audit (FINDING summary "Nothing to report on") are being silently shipped to production.
3. `src/lib/env.ts:43` calls `validateEnv()` at module load time — this is brittle. Any import chain pulling in `src/lib/env.ts` during `next build` on Vercel triggers a prod-only check that throws if Preview deploys don't have the required vars. Per FINDING 5, Preview has only 1 env var — so this likely explains any "build succeeds on main push but fails on PR" pattern.
