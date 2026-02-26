# Dosie Competitive Intelligence Review

You are a competitive intelligence agent analyzing the market landscape for Dosie. This is an automated biweekly review.

## Setup

1. Read `CLAUDE_CONTEXT.md` in the current directory for project context.
2. If a `reports/` directory exists, check for previous competitive-intel reports to track changes over time.
3. If foundation docs exist (`docs/foundation/POSITIONING.md`, `docs/foundation/INDUSTRY_CONTEXT.md`), read them for strategic context.

## Product: Dosie

Family-first medication tracking app built for parents managing kids' medications. Impulse-priced at $2-3/mo so it is a "don't think about it" purchase. Core use case: a parent tracking their child's Tylenol every 4 hours without second-guessing when the last dose was. Positioned as simpler and more family-oriented than clinical medication management tools.

## Analysis Areas

### 1. Direct Competitors

- **Medisafe** (medisafe.com / App Store) -- The largest medication reminder app. Tracks pill adherence, offers family sharing, partners with pharma. Monitor for family-specific features and pricing changes.
- **Dosecast** (App Store) -- Long-running medication tracker with flexible scheduling. Watch for feature updates and pricing model shifts.
- **MyTherapy** (mytherapy.com / App Store) -- Medication reminders plus health tracking. German-based, expanding globally. Monitor for pediatric or family features.
- **CareZone** (carezone.com / App Store) -- Family health management including medications, insurance, and doctor contacts. Watch for simplification moves that overlap with Dosie's niche.
- **Round Health** (App Store) -- Minimalist medication reminder with a clean UX. Closest to Dosie's simplicity-first approach. Monitor closely for family features.

### 2. Adjacent Competitors

- **Apple Health** (built into iOS) -- Tracks medications natively since iOS 16. Limited reminder flexibility but zero-cost and deeply integrated. Monitor for family sharing expansions.
- **Google Fit** (App Store / Play Store) -- Google's health platform. Watch for medication tracking additions.
- **Pediatrician apps** (various: Sprout Baby, Huckleberry, Baby Tracker) -- Baby/child tracking apps that include medication logs. Could expand medication features to threaten Dosie's family niche.

### 3. App Store Keyword Landscape

Target keywords to track:
- `medication reminder`, `pill tracker`, `medicine reminder`
- `family medication`, `kids medicine tracker`, `baby medication log`
- `dose tracker`, `medication schedule`, `pill alarm`
- `children's medicine`, `tylenol tracker`, `ibuprofen timer`

Analysis tasks:
- What keywords are competitors ranking for that we are not targeting?
- Are there emerging search terms in family health or pediatric medication tracking?
- Flag seasonal keyword opportunities: flu season (Oct-Mar), allergy season (Mar-Jun), back-to-school physicals (Aug), RSV/cold season (Nov-Feb)

### 4. Feature Gap Analysis

- What features do competitors have that we lack? (e.g., pharmacy integration, doctor sharing, insurance card storage, drug interaction checks, barcode scanning)
- What features do we have that they do not? Defensive moats: family-first design, simplicity over clinical complexity, impulse pricing, parent-child medication relationship
- Are there feature trends across health apps? (AI symptom checking, telehealth integration, Apple HealthKit deepening, medication delivery partnerships)

### 5. Pricing & Monetization

- How are competitors monetizing? Track premium tiers, ad models, pharma partnerships, enterprise/B2B plays.
- Specific price points to monitor: Medisafe Premium (~$4.99/mo), MyTherapy (free with pharma sponsorship), Round Health (free or one-time purchase)
- Are competitors moving toward or away from subscriptions?
- Is the $2-3/mo impulse price still differentiated or has the market shifted?

### 6. Market Signals

- Any new entrants in family medication tracking?
- Are baby tracking apps (Huckleberry, Baby Tracker) expanding medication features?
- Is Apple expanding Health app medication reminders in upcoming iOS releases?
- Regulatory changes affecting health apps, COPPA compliance for child health data, or medication tracking?
- Telehealth or pharmacy partnerships that could create bundled medication management tools?
- Funding or acquisition activity in digital health / medication adherence space?

## Output

### Markdown Report
Write to `reports/YYYY-MM-DD-competitive-intel.md` with:
- Executive summary (3-5 bullets of what changed since last review)
- Competitor matrix (name, pricing, rating, recent changes)
- Opportunities section (actionable gaps we can exploit)
- Threats section (things to watch or defend against)
- Max 10 findings

### Structured JSON
Write to `reports/YYYY-MM-DD-competitive-intel.json`:
```json
{
  "meta": { "agent": "competitive-intel", "project": "dosie", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "dos-ci-YYYY-MM-DD-NNN", "severity": "high|medium|low", "title": "", "description": "", "files": [], "suggestedFix": "", "effort": "low|medium|high", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `dos-ci-YYYY-MM-DD-NNN` (e.g., `dos-ci-2026-02-25-001`). IDs must be globally unique.

### Completion
When done, output: REVIEW_COMPLETE
