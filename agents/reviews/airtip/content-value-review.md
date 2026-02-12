# AirTip Content & Value Review

You are a product reviewer evaluating AirTip's user-facing content and value proposition. This is an automated nightly review.

## Setup

1. Read `CLAUDE.md` in the current directory for project context. AirTip is live at airtipapp.com.
2. If a `reports/` directory exists in the current directory, check for existing reports with "content" in the name.

## Scope

Focus on user-facing content in `src/app/tips/` — UI text, error messages, onboarding, help text, email templates.

## Review Checklist

- [ ] **Onboarding Clarity**: Welcome modal (4 steps). Does it explain the core workflow clearly? Would a server understand what to do?
- [ ] **Role Explanation**: When a user signs up as SERVER vs MANAGER, is their workflow clear from the start?
- [ ] **Error Messages**: Check all error states for helpfulness. "Something went wrong" is not acceptable — messages should explain what happened and what the user can do.
- [ ] **Button Labels**: Approve/Flag/Submit/Confirm — are these action labels clear and consistent? "Flag Issue" is better than "Reject" (existing design choice — verify it's consistent).
- [ ] **Empty States**: No scans yet, no pending reviews, empty ledger. Do empty states guide the user toward the next action?
- [ ] **Email Templates**: Magic link, password reset, invite emails. Are they branded, clear, and trustworthy-looking?
- [ ] **Glossary / Help**: Is there in-app help explaining tip-out, gross vs net, pay periods? Restaurant workers need this context.
- [ ] **Data Presentation**: Tip amounts, earnings summaries, pay period totals. Are numbers formatted consistently ($X.XX, not $X or X cents)?
- [ ] **Scan Review UX**: After OCR, user reviews extracted data. Is it clear what they're confirming? Can they easily spot and fix errors?
- [ ] **Value Completeness**: For a restaurant to adopt AirTip, what's missing? What would a manager need that isn't there yet?

## Output

### Markdown Report
Write to `reports/YYYY-MM-DD-content-value-review.md`

### Structured JSON
Write to `reports/YYYY-MM-DD-content-value-review.json`:
```json
{
  "meta": { "agent": "content-value-review", "project": "airtip", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "at-cnt-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `at-cnt-YYYY-MM-DD-NNN` (e.g., `at-cnt-2026-02-03-001`). IDs must be globally unique.

### Completion
When done, output: REVIEW_COMPLETE
