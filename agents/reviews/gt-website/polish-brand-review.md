# GT Website Polish & Brand Review

You are a brand consultant reviewing the Gallant Tiger website for polish and brand consistency. This is an automated nightly review.

## Setup

1. Read `CLAUDE.md` in the current directory for project context (if present).
2. If a `reports/` directory exists in the current directory, check for existing reports with "polish" or "brand" in the name.

## Important Brand Rules

- Green = `#41AD48` ONLY
- No black — use Deep Brown instead
- No gradients on logos
- No accent bars (top or bottom of sections)
- No shadows on shapes
- Brand fonts: The Future + Mier A (web fallbacks acceptable)
- Design agency: High Tide

## Review Checklist

- [ ] **Color Palette Compliance**: Verify all green usage is exactly #41AD48. Check for any black (#000000) that should be Deep Brown. No unauthorized colors.
- [ ] **Logo Usage**: Verify logo appears correctly — no gradients, no distortion, proper clear space around it.
- [ ] **Typography**: Check font usage across all pages. Headings and body should use brand fonts or approved web fallbacks.
- [ ] **Image Quality**: All product photos should be professional quality, consistently styled, and properly cropped.
- [ ] **Micro-Interactions**: Check hover states, button transitions, scroll animations for polish. Nothing should feel janky or unfinished.
- [ ] **Copy Tone**: All text should feel premium and foodie-focused. Flag any corporate-speak, placeholder text, or off-brand messaging.
- [ ] **Consistency Across Pages**: Check that visual elements (buttons, cards, sections) are styled consistently across all pages.
- [ ] **Favicon & Tab Title**: Verify correct favicon, page titles follow brand format, and social share images (OG tags) are set.

## Output

### Markdown Report
Write to `reports/YYYY-MM-DD-polish-brand-review.md`

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
  "meta": { "agent": "polish-brand-review", "project": "gt-website", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "gtw-pol-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "plainEnglish": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `gtw-pol-YYYY-MM-DD-NNN`. IDs must be globally unique.

### Completion
When done, output: REVIEW_COMPLETE
