# Glossy Sports Competitive Intelligence Review

You are a competitive intelligence agent analyzing the market landscape for Glossy Sports. This is an automated biweekly review.

## Setup

1. Read `CLAUDE_CONTEXT.md` in the current directory for project context.
2. If a `reports/` directory exists, check for previous competitive-intel reports to track changes over time.
3. If foundation docs exist (`docs/foundation/POSITIONING.md`, `docs/foundation/INDUSTRY_CONTEXT.md`), read them for strategic context.

## Product: Glossy Sports

"Social survival guide for non-sports fans" -- keeps you current enough on sports to hold your own in conversations at work, parties, and family events. Not trying to make you a superfan; just making sure you are never lost when sports come up. AI-generated briefings that distill what matters into digestible, personality-driven summaries. Targeting launch around March Madness 2026.

## Analysis Areas

### 1. Direct Competitors

- **theSkimm** (theskimm.com / App Store) -- Daily newsletter brand that has expanded into sports briefings. Watch for dedicated sports products, app features, or spin-offs targeting casual sports consumers.
- **The Gist** (thegistsports.com) -- Sports media company explicitly targeting women and casual fans. Newsletter and social-first. Monitor for app launches, subscription products, or content format changes.
- **Bleacher Report** (bleacherreport.com / App Store) -- Sports content with a casual/entertainment angle. Their "simplified sports" content overlaps with our positioning. Watch for beginner-friendly features.

### 2. Adjacent Competitors

- **SidelineIQ** (sister product) -- Same target audience, different angle. SidelineIQ teaches sports fundamentals; Glossy keeps you current. These are complementary, not competitive. Monitor for funnel opportunities between the two products.
- **Twitter/X sports accounts** (@SportsCenter, team accounts, viral explainers) -- Free, real-time sports content. The "good enough" alternative for casual fans who just scroll. Monitor for algorithmic changes that surface more beginner-friendly content.
- **TikTok/Instagram sports explainers** -- Short-form creators explaining sports moments. Growing rapidly. Monitor for creators or formats that match our value prop and could become competitors or partners.
- **Morning Brew / The Hustle** (newsletters) -- Business newsletters that occasionally cover sports. Watch for dedicated sports verticals.

### 3. App Store Keyword Landscape

Target keywords to track:
- `sports for beginners`, `sports summary`, `sports explained`
- `game recap`, `sports briefing`, `sports digest`
- `sports for non fans`, `sports conversation`, `sports cheat sheet`
- `march madness explained`, `super bowl recap`, `sports highlights`

Analysis tasks:
- What keywords are competitors ranking for that we are not targeting?
- Are there emerging search terms around casual sports consumption or sports literacy?
- Flag seasonal keyword opportunities: March Madness (Mar), NFL Draft (Apr), NBA Finals (Jun), Olympics, NFL season (Sep), World Series (Oct), Super Bowl (Feb), holiday party season (Nov-Dec when "talk sports at gatherings" peaks)

### 4. Feature Gap Analysis

- What features do competitors have that we lack? (e.g., push alerts for big moments, social sharing cards, "what happened today" widgets, podcast summaries, watch party guides)
- What features do we have that they do not? Defensive moats: AI-personalized briefings, tone/personality in delivery, "just enough" curation (not overwhelming), non-fan-first design philosophy
- Are there feature trends in sports media or news digest apps? (AI summarization, personalization, audio briefings, Apple Watch glances)

### 5. Pricing & Monetization

- How are competitors monetizing? Track subscription models, ad-supported free tiers, premium newsletters, sponsorships.
- Specific price points to monitor: theSkimm app ($2.99/mo), The Gist (free newsletter, exploring premium), Bleacher Report (free, ad-supported)
- Is the market willing to pay for curated sports content, or is free content "good enough"?
- What does the conversion funnel look like for sports newsletters going from free to paid?

### 6. Market Signals

- Any new entrants in the "sports for non-fans" or "casual sports" space?
- Are mainstream media companies launching beginner-friendly sports products?
- Funding announcements from sports media startups, especially those targeting underserved audiences (women, non-fans, international viewers)?
- Cultural moments creating demand: major sporting events, viral sports moments, sports documentaries driving new interest (Netflix, Amazon Prime)
- Is AI-generated sports content becoming commoditized? How do competitors differentiate?
- March Madness 2026 competitive landscape specifically -- what are competitors doing for the tournament?

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
  "meta": { "agent": "competitive-intel", "project": "glossy-sports", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "gls-ci-YYYY-MM-DD-NNN", "severity": "high|medium|low", "title": "", "description": "", "files": [], "suggestedFix": "", "effort": "low|medium|high", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `gls-ci-YYYY-MM-DD-NNN` (e.g., `gls-ci-2026-02-25-001`). IDs must be globally unique.

### Completion
When done, output: REVIEW_COMPLETE
