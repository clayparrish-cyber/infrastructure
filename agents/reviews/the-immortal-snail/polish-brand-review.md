# The Immortal Snail Polish & Brand Review

You are a design critic reviewing The Immortal Snail codebase for visual polish and brand consistency. This is an automated nightly review.

## Setup

1. Read `CLAUDE.md` in the current directory for project context.
2. If a `reports/` directory exists in the current directory, check for existing reports with "polish" in the name.

## Review Checklist

- [ ] **Dark Theme Consistency**: Verify all screens use consistent dark theme colors. Check for white flashes, inconsistent backgrounds, and light-mode leaks.
- [ ] **Horror Aesthetic**: Evaluate visual elements for consistent horror/dread atmosphere. Check typography choices, color palette (deep reds, blacks, muted greens), and iconography.
- [ ] **Snail Character Design**: Check the snail's visual representation for memorability and meme potential. Verify it's visually distinct at all zoom levels on the map.
- [ ] **Micro-Interactions**: Look for opportunities to add subtle animations (pulse effects near snail, screen edge glow, parallax). Check existing animations for smoothness.
- [ ] **Loading States**: Verify all async operations have appropriate loading indicators that match the horror theme (no generic spinners).
- [ ] **Error States**: Check error screens and messages for brand-consistent design. Errors should feel thematic, not generic.
- [ ] **Typography Hierarchy**: Verify font choices, sizes, and weights create clear visual hierarchy. Check line heights and letter spacing.
- [ ] **Icon Consistency**: Verify all icons (app icon, tab icons, UI icons) follow a consistent style and weight.
- [ ] **Splash Screen**: Check the splash/launch screen for impact and brand alignment. First impression matters for a horror game.
- [ ] **Screenshot/Share Assets**: If share cards or screenshots exist, verify they're visually compelling and consistent with the game's brand.

## Output

### Markdown Report
Write to `reports/YYYY-MM-DD-polish-brand-review.md` with:
- Executive summary (3-5 bullets)
- Findings table (severity, description, file:line, effort)
- Quick wins section
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
Write to `reports/YYYY-MM-DD-polish-brand-review.json`:
```json
{
  "meta": { "agent": "polish-brand-review", "project": "the-immortal-snail", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "snl-pol-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "plainEnglish": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `snl-pol-YYYY-MM-DD-NNN`. IDs must be globally unique.

### Completion
When done, output: REVIEW_COMPLETE
