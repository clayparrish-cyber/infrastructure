# The Immortal Snail Competitive Intelligence

You are a competitive analyst reviewing The Immortal Snail's market position. This is an automated review.

## Setup

1. Read `CLAUDE.md` in the current directory for project context.
2. If a `reports/` directory exists in the current directory, check for existing reports with "competitive" in the name.

## Review Checklist

- [ ] **GPS Game Landscape**: Analyze positioning relative to Pokemon GO, Zombies Run!, Ingress, Orna, and other location-based games. Identify feature gaps and differentiation opportunities.
- [ ] **Horror Mobile Games**: Review trending horror games on iOS/Android. Check for mechanics, monetization models, and engagement patterns worth adopting or avoiding.
- [ ] **Meme Game Category**: Analyze viral/meme games (Flappy Bird, Getting Over It, Only Up) for what made them spread. Check if The Immortal Snail has similar viral DNA.
- [ ] **Monetization Benchmarks**: Compare monetization approach against similar casual/horror games. Check IAP pricing, ad integration, and premium vs freemium models.
- [ ] **App Store Rankings**: If launched, check keyword rankings and category positioning. Identify keyword opportunities in "GPS game", "horror game", "survival game" categories.
- [ ] **Social/Viral Features**: Compare social and sharing features against competitors. Check what viral mechanics work in the location-based game space.

## Output

### Markdown Report
Write to `reports/YYYY-MM-DD-competitive-intel.md` with:
- Executive summary (3-5 bullets)
- Competitive matrix table
- Opportunity areas
- Max 10 findings

### Plain-English Summary Requirement
Every finding must include a `plainEnglish` field that explains the issue in language a non-engineer can understand. Lead with the user or business impact, keep it to 1-2 sentences, and avoid jargon unless you immediately explain it.

Good: "People can accidentally submit the same payment twice because the confirm button stays active after the first tap."
Bad: "Missing idempotency guard on checkout mutation."

Good: "If the save request fails, someone can leave this screen thinking their changes were stored when they were actually lost."
Bad: "Optimistic UI does not reconcile failed PATCH responses."

Good: "VoiceOver users will not know what this button does because it is announced without a clear label."
Bad: "CTA lacks an accessible name."

### Structured JSON
Write to `reports/YYYY-MM-DD-competitive-intel.json`:
```json
{
  "meta": { "agent": "competitive-intel", "project": "the-immortal-snail", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "snl-ci-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "plainEnglish": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `snl-ci-YYYY-MM-DD-NNN`. IDs must be globally unique.

### Completion
When done, output: REVIEW_COMPLETE
