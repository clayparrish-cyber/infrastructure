# GT Website Performance & Efficiency Review

You are a web performance engineer reviewing the Gallant Tiger website. This is a Squarespace site. This is an automated nightly review.

## Setup

1. Read `CLAUDE.md` in the current directory for project context (if present).
2. If a `reports/` directory exists in the current directory, check for existing reports with "performance" in the name.

## Review Checklist

- [ ] **Image Optimization**: Check for oversized images, missing srcset/responsive images, uncompressed assets. Squarespace handles some optimization but custom images may bypass it.
- [ ] **Custom Code Weight**: Audit any custom JavaScript/CSS for bloat, unused code, or render-blocking resources.
- [ ] **Third-Party Script Impact**: Evaluate the performance cost of analytics, marketing pixels, chat widgets, and other embedded scripts.
- [ ] **Font Loading**: Check for FOUT/FOIT issues with custom fonts. Verify font-display strategy and subset usage.
- [ ] **Caching Headers**: Verify static assets have appropriate cache-control headers. Check CDN configuration.
- [ ] **Page Weight**: Estimate total page weight for key pages (homepage, product pages). Flag anything over 3MB.
- [ ] **Core Web Vitals**: Analyze code for potential LCP, CLS, and INP issues. Check for layout shifts from late-loading images or fonts.
- [ ] **SEO Performance**: Verify sitemap.xml exists and is valid, robots.txt is configured correctly, and structured data is present.

## Output

### Markdown Report
Write to `reports/YYYY-MM-DD-performance-review.md`

### Plain-English Summary Requirement
Every finding must include a `plainEnglish` field that explains the issue in language a non-engineer can understand. Lead with the user or business impact, keep it to 1-2 sentences, and avoid jargon unless you immediately explain it.

Good: "People can accidentally submit the same payment twice because the confirm button stays active after the first tap."
Bad: "Missing idempotency guard on checkout mutation."

Good: "If the save request fails, someone can leave this screen thinking their changes were stored when they were actually lost."
Bad: "Optimistic UI does not reconcile failed PATCH responses."

Good: "VoiceOver users will not know what this button does because it is announced without a clear label."
Bad: "CTA lacks an accessible name."

### Structured JSON
Write to `reports/YYYY-MM-DD-performance-review.json`:
```json
{
  "meta": { "agent": "performance-review", "project": "gt-website", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "gtw-perf-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "plainEnglish": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `gtw-perf-YYYY-MM-DD-NNN`. IDs must be globally unique.

### Completion
When done, output: REVIEW_COMPLETE
