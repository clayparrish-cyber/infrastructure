# Forbidden-Claims CI Guardrail — Cross-Repo Matrix

**Date:** 2026-04-09
**Author:** Claude (research agent)
**Scope:** Evaluate which private repos beyond `gt-shopify-theme` should get the
same forbidden-phrases CI workflow (`.github/workflows/forbidden-claims.yml`).
**Reference pattern:** GT theme workflow fails CI on phrase match, allowlist for
ingredient lists, auto-opens issue on failure, required status on `main`.

---

## TL;DR priority order

| Priority | Repo | Recommendation | Why |
|---|---|---|---|
| 1 | **Apolis/menu-autopilot** | **YES, do now** | Sends marketing emails + tips claims to restaurants; Stripe-involved; false claims = legal/compliance risk |
| 2 | **Personal/SidelineIQ/sideline-iq-landing** | **YES, do now** | LIVE public landing page; centralized `variants.ts` is a perfect scan target; brand-color regressions already happened |
| 3 | **Personal/Dosie** | **YES, do now (double-duty)** | User-facing medication app + mid-rebrand; legacy "Dosie" and "dosie" strings need to be stamped out; health-claim risk |
| 4 | **Personal/SidelineIQ/sideline-iq** | **YES (app + templates only)** | LIVE on App Store; AI-generated curriculum content has seen brand-color mistakes; needs AI-copy-tells + SEO claim guards |
| 5 | **Mainline Apps/glossy-sports** | **YES, lightweight** | Monorepo sibling of dashboard; public-facing hockey app; low current copy surface but about to grow |
| 6 | **Gallant Tiger/gt-ops** | **DEFER, narrow scope** | Internal tool only. But: has `shopify-enrich` module that could one day push copy, and test fixture literally contains "high-oleic sunflower oil". Narrow guard ONLY on shopify-enrich/klaviyo directories is warranted |
| 7 | **Mainline Apps/the-immortal-snail** | **DEFER** | Live on App Store but is a horror-meme game — the few user-facing strings are intentionally weird; very low claim-risk surface |
| 8 | **Mainline Apps/dashboard (mainline-command-center)** | **N/A, skip** | Internal tool behind Cloudflare Access; no customer-facing copy |
| 9 | **infrastructure** | **N/A, skip** | Agent prompt repo; prompts generate findings consumed internally. Not customer-facing. |
| 10 | **agent-dashboard** | **N/A, does not exist as standalone** | `agent-dashboard` is a subfolder of `sideline-iq` containing only data, and the archived copy at `_archived/agent-dashboard` is dead. No separate repo to guard. |

---

## Per-repo detail

### 1. Apolis/menu-autopilot — YES, DO NOW

**Path:** `/Volumes/Lexar/Projects/Apolis/menu-autopilot`
**Stack:** Next.js 16, Prisma, NextAuth, Resend, Stripe
**User-facing copy?** **Yes, heavy.**
- Weekly email reports sent to restaurant owners
- Landing copy, pricing page, upgrade flows
- AirTip sub-app (`/tips`) — tip compliance tool with legal implications
- Scheduled email cron at `app/api/cron/send-scheduled-emails`

**Forbidden-phrase draft list:**
```
# Compliance landmines (AirTip)
- guaranteed compliant
- IRS.approved                   # not a thing
- legally (binding|compliant|required)
- tax.deductible                 # without qualification
- 100% compliant

# False savings claims (core app)
- guarantee.{0,10}(save|savings|profit|margin)
- double your (revenue|margin|profit)
- 10x your (sales|revenue)
- instantly (profitable|optimize)

# AI copy tells (from feedback_no-ai-copy-tells.md)
- Generates, Not Sends           # the exact example Clay flagged
- Built, Not Bought
- Reimagining (the|your)
- Revolutionizing (restaurants|dining|menus)
- Transforming (your|the) menu

# Pre-launch teasers
- coming soon                    # should not ship to live copy
- beta access                    # unless on a gated page
```

**Allowlist:** README.md, docs/**, CHANGELOG.md, input docs/**. Scan
`src/app/**/*.tsx`, `src/lib/email/**`, `templates/**`, `src/app/api/reports/**/email/**`.

**Risk if wrong claim ships:** HIGH. AirTip touches labor/tip compliance — a
false "guaranteed compliant" claim is plausible legal exposure. Menu Autopilot
savings claims could trip FTC endorsement guides.

**Effort:** ~30 min. Workflow copy + phrase list. Email templates are
centralized (checked — no scattered HTML strings). Branch protection addition.

---

### 2. Personal/SidelineIQ/sideline-iq-landing — YES, DO NOW

**Path:** `/Volumes/Lexar/Projects/Personal/SidelineIQ/sideline-iq-landing`
**Stack:** Next.js, Tailwind, variants-based A/B landing
**User-facing copy?** **Yes — this IS the landing page.** LIVE (verified: app
is shipping, App Store link `id6757969950` hard-coded).

**Key finding:** Copy is centralized in `src/lib/variants.ts` — one file, perfect
scan target. Means the workflow can scan just that file plus `src/app/page.tsx`
and catch 100% of marketing claims.

**Forbidden-phrase draft list:**
```
# Brand color drift (from feedback_sidelineiq-brand-color.md)
- #F5A623                        # the incorrect gold
- gold (brand|color|accent)      # in CSS/content
- brand.{0,5}gold

# AI copy tells
- Generates, Not Sends
- Built, Not Bought
- Not (Just|Another) (Another|Simple)
- Reimagining sports
- Revolutionizing (how you|sports|the game)
- The (future|next generation) of sports (analytics|IQ)

# Unverifiable ASO / ranking claims
- #1 sports (iq|analytics|knowledge) app
- voted (best|top)
- as seen on                     # unless actually placed
- trusted by (millions|thousands)   # until we actually have those numbers

# Pre-launch / dead copy
- coming soon
- join the waitlist              # app is LIVE, waitlist is dead CTA
- launching (fall|spring|summer) 202
```

**Risk if wrong claim ships:** MEDIUM. Sports-knowledge app so no health/legal
claims, but false ranking claims ("#1") and brand-color regressions have real
history (logged in feedback). Also, "join the waitlist" would be a CX bug —
the app is live.

**Effort:** ~20 min. One variants file + page.tsx. Simple.

---

### 3. Personal/Dosie (being rebranded to "Tended") — YES, DO NOW, double-duty

**Path:** `/Volumes/Lexar/Projects/Personal/Dosie`
**Stack:** Expo monorepo (`apps/mobile`) + Next.js web (`web/`) + native Swift (`Dosie/`)
**User-facing copy?** **Yes — App Store listing, web landing, in-app copy, push notifications.**

**Critical finding:** Confirmed 10+ files in `apps/mobile/` still contain "Dosie"
or "dosie" references (21 total occurrences checked). The rebrand to "Tended" is
INCOMPLETE per memory `dosie-tended-rebrand.md` — bundle ID, deep link scheme,
and 167 files pending rename. A forbidden-phrase guard can MECHANICALLY ENFORCE
the rebrand completion and prevent regression.

**Forbidden-phrase draft list:**
```
# Rebrand enforcement (dosie → tended)
- \bDosie\b                      # forbidden in new commits to marketing paths
- \bdosie\b                      # lowercase, catches dosie:// deep links
- getdosie\.com                  # old domain, 301 to tendedapp.app
- com\.dosieapp                  # old bundle ID
- @dosie/                        # old package scope

# Health claims (regulatory risk — FDA/FTC)
- medical advice
- diagnose|treat|cure            # classic FDA trigger words
- doctor recommended             # without source
- prescribed by                  # we don't prescribe
- (safe|proven|clinically) (for|to)
- (replaces|alternative to) (your doctor|medical)

# AI copy tells
- Reimagining (family|medicine|health)
- Revolutionizing (medication|caregiving)
- Not Just Another (reminder|app)
```

**Allowlist:** `CHANGELOG.md`, `docs/**`, git history commit messages,
`ios/**/project.pbxproj` (during rename transition), Swift legacy folder
`Dosie/**/*.swift` (being deleted anyway). Scan
`apps/mobile/**/*.{tsx,ts,json,md}`, `web/src/**`, `app.config.ts`.

**Risk if wrong claim ships:**
- Health claims: HIGH (FDA/FTC exposure — this is a med-reminder app)
- Rebrand regression: MEDIUM (confuses users, fragments brand)
- Cumulative: high enough to justify the guard now rather than wait.

**Effort:** ~45 min. Slightly higher because of rebrand phase allowlist tuning
— need to exempt files that still legitimately need the old bundle ID during
the rename transition. Worth pairing with a tracking issue: "Remove every
Dosie reference; forbidden-claims will keep it that way."

**Bonus value:** This guard becomes the rebrand completion checker. When the
workflow turns green, the rebrand is code-complete.

---

### 4. Personal/SidelineIQ/sideline-iq (the Expo app) — YES

**Path:** `/Volumes/Lexar/Projects/Personal/SidelineIQ/sideline-iq`
**Stack:** Expo/React Native, live on App Store
**User-facing copy?** **Yes.**
- App Store metadata
- In-app lesson/curriculum content (`content/lessons-*.ts`, `content/concepts.ts`)
- ~11 curriculum files including `baseball-tier1-generated.ts` through `tier4` — AI-generated, prime territory for copy tells

**Forbidden-phrase draft list:**
```
# AI copy tells (biggest risk given AI-generated content)
- Generates, Not Sends
- Built, Not Bought
- Reimagining sports
- Revolutionizing (how you|the game|sports)

# Brand color
- #F5A623
- brand gold

# Unverifiable claims
- guaranteed to improve
- proven by (coaches|pros|experts)
- used by (the pros|NFL|NBA|MLB)

# Factual hazards in curriculum content (examples only — tune per sport)
- # None today, but a content-drift guard is useful once curriculum grows
```

**Allowlist:** `__tests__/**`, `content/**-generated.ts` should be scanned
(they are the risk). `docs/**`, `CHANGELOG.md`, `reports/**` exempt.

**Risk if wrong claim ships:** MEDIUM-LOW. Sports education app. Worst case
is an embarrassingly generic AI headline. No legal/health exposure.

**Effort:** ~30 min. Slightly more involved because curriculum is spread
across multiple generated files. Can do this together with the landing page
in one PR.

---

### 5. Mainline Apps/glossy-sports — YES, lightweight

**Path:** `/Volumes/Lexar/Projects/Mainline Apps/glossy-sports`
**Stack:** Expo in a monorepo (shares repo with `dashboard`)
**User-facing copy?** **Yes — hockey analytics app, public on stores (or nearly).**
Copy surface today is small but growing (PWHL, briefings, talking points).

**Monorepo consideration:** Repo is `clayparrish-cyber/mainline-apps`. The same
workflow file can scan BOTH `glossy-sports/**` and `dashboard/**`, though
dashboard is internal and doesn't need it. Use a workflow filter like
`paths: ['glossy-sports/**']` to scope.

**Forbidden-phrase draft list:**
```
# AI copy tells
- Generates, Not Sends
- Built, Not Bought
- Reimagining hockey
- Revolutionizing sports

# Unverifiable claims
- official (PWHL|NHL|NWSL) app        # we aren't
- partnered with (PWHL|NHL)            # not yet
- real-time (unless we are — verify)   # caching is 2min, not realtime
- live scores                          # technically 2-min cached

# Brand/data source honesty
- official data
- licensed (NHL|PWHL|ESPN) data        # we scrape unofficial APIs
```

**Risk if wrong claim ships:** MEDIUM. "Official PWHL app" or "licensed NHL
data" would be trademark infringement. Data source is ESPN/HockeyTech
unofficial APIs — calling it "official" is factually wrong.

**Effort:** ~30 min. Monorepo path filter adds a bit.

---

### 6. Gallant Tiger/gt-ops — DEFER, OR narrow-scope guard

**Path:** `/Volumes/Lexar/Projects/Gallant Tiger/gt-ops`
**Stack:** Next.js 16, Prisma, internal GT ops dashboard behind auth
**User-facing copy?** **No for customers. Yes internally (team only).**

**BUT — there's a real concern I want to flag:**
1. `src/lib/shopify-enrich/__tests__/content-drift.test.ts` literally contains
   the string `"Made with high-oleic sunflower oil"` as a test fixture. Today
   that's harmless (test-only). But if a future AI-generated diff suggests it
   as a replacement phrase, or if someone copy-pastes it into production code,
   the GT Shopify repo's guard would catch it — but only AFTER it's pushed to
   that repo. Catching it in gt-ops would be defense-in-depth.
2. `src/lib/klaviyo.ts` is currently profile-sync only (verified — no template
   sending). But Klaviyo lib is a natural place for future campaign HTML.
3. `gt-ops` sends password-reset emails from `noreply@gallanttiger.com` —
   those DO reach customers (wholesale buyers are GT customers).

**Recommendation:** DEFER full workflow, but either:
- (a) Delete the "high-oleic sunflower oil" test fixture string and replace
  with a non-claim ("Made with ingredients"), or
- (b) Add a NARROW forbidden-claims workflow that only scans
  `src/lib/shopify-enrich/**`, `src/lib/klaviyo.ts`, and `src/lib/email.ts`
  plus any `src/**/*email*` file, with the same GT phrase list as the theme repo.

Option (b) is the durable long-term fix and matches Clay's global rule on
defense-in-depth. Option (a) is a one-line cleanup but doesn't prevent
regression.

**Forbidden-phrase list:** Same as `gt-shopify-theme` (no seed oils / no
sunflower oil / no non-GMO), scoped to the narrow paths above.

**Risk if wrong claim ships:** LOW today (internal tool), MEDIUM if shopify-enrich
or klaviyo ever pushes copy outward.

**Effort:** ~15 min for option (a), ~30 min for option (b). Option (b) is
preferred as the durable fix.

---

### 7. Mainline Apps/the-immortal-snail — DEFER

**Path:** `/Volumes/Lexar/Projects/Mainline Apps/the-immortal-snail`
**Stack:** Expo, live on App Store (v1.0 submitted 2026-03-11)
**User-facing copy?** Yes but **intentionally minimal and weird by design.**
GPS horror/meme game. Tagline: "The snail is always coming." Copy is
absurdist, not claim-based.

**Why defer:** The few user-facing strings (death.tsx, onboarding.tsx,
ShareCard.tsx) are intentionally strange. A forbidden-phrases list is unlikely
to add value — there are no health, legal, or rebrand risks here.

**If you ever add it:** Only exclude "AI copy tells" like
"Reimagining horror games" or "Revolutionizing GPS". Low priority.

**Risk:** Low.
**Effort:** Not worth it for now. Revisit if/when you add IAP marketing copy.

---

### 8. Mainline Apps/dashboard (mainline-command-center) — N/A, SKIP

**Path:** `/Volumes/Lexar/Projects/Mainline Apps/dashboard`
**Confirmation:** `package.json` name is `mainline-apps-dashboard` and CLAUDE.md
confirms this is the Command Center at `app.mainlineapps.com`.
**User-facing copy?** **No.** Internal tool behind Cloudflare Access magic link.
Only Clay and Bill use it.

**Skip rationale:** No customers see any copy here. Any "claims" in this repo
are UI labels for internal dashboards.

---

### 9. infrastructure — N/A, SKIP

**Path:** `/Volumes/Lexar/Projects/infrastructure`
**User-facing copy?** **No.** Agent prompt repo. Prompts produce findings that
are read internally by Clay/Bill. No external distribution.

**Skip rationale:** The agent prompt markdown files are instructions to AI, not
claims being made to users. If anything, the forbidden-phrase PATTERN itself
could go INTO these prompts as a rule ("agents must never output phrases X/Y/Z
when editing copy files in project Z").

**Suggested alternative:** Add forbidden-phrase awareness to the
`agents/reviews/*/content-value-review.md` prompts so the content-review agent
checks for these phrases during nightly reviews — complements the CI guardrails
with a proactive detection layer.

---

### 10. agent-dashboard — N/A, does not exist as a standalone repo

**Search results:**
- `/Volumes/Lexar/Projects/Personal/SidelineIQ/sideline-iq/agent-dashboard/` — only contains a `data/` folder (internal agent output snapshots)
- `/Volumes/Lexar/Projects/_archived/agent-dashboard/` — archived, dead

**There is no separate agent-dashboard repo to guard.** The original candidate
in the task is either a stale reference or has been absorbed into
`mainline-apps/dashboard` (which is the actual Command Center).

---

## Rollout recommendation

**Batch 1 (this week, ~2 hours total):**
1. menu-autopilot — biggest compliance exposure
2. sideline-iq-landing — easiest, centralized copy
3. Dosie (as rebrand-completion enforcer)

**Batch 2 (next week, ~1 hour):**
4. sideline-iq (app) — pair with landing page
5. glossy-sports — lightweight

**Batch 3 (paternity-leave durability pass):**
6. gt-ops narrow-scope guard on shopify-enrich/klaviyo/email.ts

**Skip entirely:**
7. the-immortal-snail (low value, intentionally weird copy)
8. mainline-apps/dashboard (internal)
9. infrastructure (prompts, not content)
10. agent-dashboard (not a real repo)

---

## Template: shared workflow YAML structure

All workflows should share this skeleton, with only the phrase list and
`paths:` filter changing per repo:

```yaml
name: Forbidden claims check
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Scan for forbidden phrases
        run: |
          PHRASES=(
            # project-specific list goes here
          )
          ALLOWLIST='(ingredient|docs/|CHANGELOG|README)'
          FAIL=0
          for P in "${PHRASES[@]}"; do
            MATCHES=$(git grep -I -l -i -E "$P" -- ':!node_modules' ':!*.lock' 2>/dev/null || true)
            FILTERED=$(echo "$MATCHES" | grep -v -E "$ALLOWLIST" || true)
            if [ -n "$FILTERED" ]; then
              echo "::error::Forbidden phrase '$P' found in:"
              echo "$FILTERED"
              FAIL=1
            fi
          done
          exit $FAIL
      - name: Open issue on failure
        if: failure() && github.event_name == 'push'
        uses: actions/github-script@v7
        with:
          script: |
            # auto-open issue pattern from gt-shopify-theme
```

**Per-repo work:** edit PHRASES array, tune ALLOWLIST, set `paths:` filter in
monorepos. That's it. Branch protection addition in GitHub UI once per repo.

---

## Surprising findings

1. **`gt-ops` has a test fixture containing "high-oleic sunflower oil".** It's
   test-only today, but this is the kind of string that leaks into production
   when someone LLM-assists a refactor. Worth a cleanup either way.
2. **Dosie rebrand is 50% done in code.** 21 "Dosie" references still live
   across 10+ files in `apps/mobile/`. The forbidden-claims workflow is
   actually the PERFECT tool to finish the rebrand mechanically.
3. **agent-dashboard is not a real standalone repo.** The task listed it but
   it's either a subfolder of sideline-iq or archived. Flag for Clay.
4. **SidelineIQ landing uses a `variants.ts` A/B system** — any
   forbidden-claims scan should treat it as the primary target. Very clean.
5. **mainline-apps is a monorepo** (dashboard + glossy-sports + others).
   The workflow needs `paths:` filters to scope — can't blindly scan the root.
6. **infrastructure agent prompts are a better home for proactive detection**
   — rather than CI guardrails, the content-value-review.md prompt should
   teach the nightly agent to flag forbidden phrases during code review.
   Complements the CI approach without adding another workflow file.
