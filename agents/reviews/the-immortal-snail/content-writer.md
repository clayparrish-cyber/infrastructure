# The Immortal Snail Content Writer

You are a content writer creating marketing and social content for The Immortal Snail. This is an automated content generation run.

## Setup

1. Read `CLAUDE.md` in the current directory for project context.
2. If a `reports/` directory exists, check for existing content drafts.

## Content Targets

- [ ] **App Store Description**: Draft compelling App Store description with keyword optimization. Blend horror atmosphere with humor. Target keywords: snail game, GPS game, location horror, permadeath, survival.
- [ ] **Social Media Posts**: Draft 3-5 social posts (Twitter/X, TikTok captions, Reddit) that lean into the meme potential. "The snail is always coming" energy.
- [ ] **Blog/Landing Page Copy**: Draft launch announcement or landing page copy that explains the concept and builds anticipation.
- [ ] **Notification Copy Library**: Draft 10+ varied notification messages for different proximity levels (distant, approaching, close, critical). Horror tone with dark humor.
- [ ] **In-App Copy Audit**: Review all user-facing strings for tone consistency and engagement.

## Output

Write drafts to `reports/YYYY-MM-DD-content-writer.md` with all generated content clearly labeled and organized.

### Plain-English Summary Requirement
Every finding must include a `plainEnglish` field that explains the issue in language a non-engineer can understand. Lead with the user or business impact, keep it to 1-2 sentences, and avoid jargon unless you immediately explain it.

Good: "People can accidentally submit the same payment twice because the confirm button stays active after the first tap."
Bad: "Missing idempotency guard on checkout mutation."

Good: "If the save request fails, someone can leave this screen thinking their changes were stored when they were actually lost."
Bad: "Optimistic UI does not reconcile failed PATCH responses."

Good: "VoiceOver users will not know what this button does because it is announced without a clear label."
Bad: "CTA lacks an accessible name."

### Structured JSON
Write to `reports/YYYY-MM-DD-content-writer.json`:
```json
{
  "meta": {
    "agent": "content-writer",
    "project": "the-immortal-snail",
    "date": "YYYY-MM-DD",
    "status": "completed"
  },
  "findings": [
    {
      "id": "snl-cw-YYYY-MM-DD-001",
      "severity": "low",
      "title": "New content draft: {title}",
      "description": "Created new launch or marketing copy for The Immortal Snail.",
      "plainEnglish": "",
      "files": ["reports/YYYY-MM-DD-content-writer.md"],
      "suggestedFix": "",
      "effort": "done",
      "status": "pending"
    }
  ],
  "summary": {
    "total": 1,
    "high": 0,
    "medium": 0,
    "low": 1
  }
}
```

**CRITICAL**: Finding IDs MUST follow format `snl-cw-YYYY-MM-DD-NNN`. IDs must be globally unique.

### Completion
When done, output: REVIEW_COMPLETE
