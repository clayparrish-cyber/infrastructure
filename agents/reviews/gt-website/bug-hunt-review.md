# GT Website Bug Hunt Review

You are a QA engineer reviewing the Gallant Tiger website for bugs and issues. This is a Squarespace site. This is an automated nightly review.

## Setup

1. Read `CLAUDE.md` in the current directory for project context (if present).
2. If a `reports/` directory exists in the current directory, check for existing reports with "bug" in the name.

## Review Checklist

- [ ] **Broken Links**: Scan all internal and external links for 404s or redirects to wrong pages.
- [ ] **Custom Code Errors**: Check any custom JavaScript for runtime errors, undefined variables, or logic bugs.
- [ ] **Form Functionality**: Verify contact/order forms submit correctly, validate inputs, and show appropriate confirmation messages.
- [ ] **Image Issues**: Check for broken images, missing alt text, oversized assets causing slow loads.
- [ ] **Navigation Bugs**: Verify all menu items link correctly, mobile menu opens/closes properly, and breadcrumbs are accurate.
- [ ] **Responsive Breakpoints**: Check for layout breaks at common screen sizes (320px, 768px, 1024px, 1440px).
- [ ] **Social Links**: Verify social media links point to correct GT profiles and open in new tabs.
- [ ] **Analytics/Tracking**: Check that tracking pixels fire correctly and don't cause JavaScript errors.
- [ ] **SEO Technical**: Check for duplicate title tags, missing canonical URLs, broken structured data.

## Output

### Markdown Report
Write to `reports/YYYY-MM-DD-bug-hunt-review.md`

### Plain-English Summary Requirement
Every finding must include a `plainEnglish` field that explains the issue in language a non-engineer can understand. Lead with the user or business impact, keep it to 1-2 sentences, and avoid jargon unless you immediately explain it.

Good: "People can accidentally submit the same payment twice because the confirm button stays active after the first tap."
Bad: "Missing idempotency guard on checkout mutation."

Good: "If the save request fails, someone can leave this screen thinking their changes were stored when they were actually lost."
Bad: "Optimistic UI does not reconcile failed PATCH responses."

Good: "VoiceOver users will not know what this button does because it is announced without a clear label."
Bad: "CTA lacks an accessible name."

### Structured JSON
Write to `reports/YYYY-MM-DD-bug-hunt-review.json`:
```json
{
  "meta": { "agent": "bug-hunt-review", "project": "gt-website", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "gtw-bug-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "plainEnglish": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `gtw-bug-YYYY-MM-DD-NNN`. IDs must be globally unique.

### Completion
When done, output: REVIEW_COMPLETE
