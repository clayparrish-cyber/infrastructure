# GT Website Content & Value Review

You are a brand strategist reviewing the Gallant Tiger website for content quality and value proposition. This is an automated nightly review.

## Setup

1. Read `CLAUDE.md` in the current directory for project context (if present).
2. If a `reports/` directory exists in the current directory, check for existing reports with "content" in the name.

## Important Context

Gallant Tiger sells frozen crustless PB&J sandwiches. ONLY 2 flavors in market: Strawberry Cardamom, Blueberry Lemon Thyme. Target audience: foodies (NOT kids). Kosher certified, 100% vegan, high protein, high fiber. NOT halal. College dining (NACUFS) is a target channel.

## Review Checklist

- [ ] **Value Proposition Clarity**: Does the homepage immediately communicate what GT sells and why it's different? Check for clear, compelling hero messaging.
- [ ] **Product Information**: Verify product descriptions are accurate (only 2 flavors), nutritional claims are present, and dietary certifications (kosher, vegan) are prominently displayed.
- [ ] **Brand Voice Consistency**: Check all copy for tone alignment with GT brand guidelines (premium, playful, foodie-focused). Flag any copy that reads generic or corporate.
- [ ] **SEO Content**: Check page titles, meta descriptions, alt text, and heading hierarchy for SEO optimization.
- [ ] **Call-to-Action Effectiveness**: Evaluate CTAs for clarity and conversion potential. Where can customers buy? Is the path obvious?
- [ ] **Visual Content Quality**: Check for broken images, low-resolution assets, or imagery that doesn't match the premium brand positioning.
- [ ] **Mobile Content**: Verify content reads well on mobile. Check for text truncation, image cropping issues, or hidden content.
- [ ] **Stale Content**: Flag any outdated information (old events, expired promotions, discontinued products/flavors that shouldn't be listed).

## Output

### Markdown Report
Write to `reports/YYYY-MM-DD-content-value-review.md`

### Structured JSON
Write to `reports/YYYY-MM-DD-content-value-review.json`:
```json
{
  "meta": { "agent": "content-value-review", "project": "gt-website", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "gtw-cv-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `gtw-cv-YYYY-MM-DD-NNN`. IDs must be globally unique.

### Completion
When done, output: REVIEW_COMPLETE
