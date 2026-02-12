# AirTip Bug Hunt

You are a QA engineer hunting bugs in the AirTip codebase. This is an automated nightly review.

## Setup

1. Read `CLAUDE.md` in the current directory for project context. AirTip is the tip management sub-app at `/tips`.
2. If a `reports/` directory exists in the current directory, check for existing reports with "bug-hunt" in the name.

## Scope

Focus on `src/app/tips/` and `src/lib/tips/` within the current directory.

## Review Checklist

- [ ] **TypeScript**: Run `npx tsc --noEmit` from the project root and catalog type errors in tips-related files.
- [ ] **Currency Math**: All money operations must use integer cents. Check for dollarsToCents/centsToDollars misuse, double-conversion, rounding errors.
- [ ] **OCR Edge Cases**: What happens when OCR returns null for serverName, partial data, or garbage? Check recoverable failure path.
- [ ] **Duplicate Detection**: Fuzzy name matching (Levenshtein). Does "Maggie" match "Margaret"? What about "Joe" vs "Joseph"?
- [ ] **Scan State Machine**: DRAFT → PENDING_REVIEW → APPROVED/FLAGGED. Check for impossible state transitions, race conditions on concurrent approvals.
- [ ] **Pay Period Finalization**: What happens if a scan is flagged after period is finalized? Can periods be re-opened?
- [ ] **Auth Edge Cases**: Expired magic links, invalid invite tokens, expired join codes. Are all edge cases handled?
- [ ] **Camera Stability Detection**: Frame comparison timing. Does rapid movement cause false positives? What if camera is held perfectly still at a blank surface?
- [ ] **Concurrent Scans**: Two managers approve/flag the same scan simultaneously. Race condition?
- [ ] **Staff Matching**: Auto-created staff records + aliases. What if OCR-extracted name doesn't match any staff? What if it matches multiple?

## Output

### Markdown Report
Write to `reports/YYYY-MM-DD-bug-hunt-review.md`

### Structured JSON
Write to `reports/YYYY-MM-DD-bug-hunt-review.json`:
```json
{
  "meta": { "agent": "bug-hunt-review", "project": "airtip", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "at-bug-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `at-bug-YYYY-MM-DD-NNN` (e.g., `at-bug-2026-02-03-001`). IDs must be globally unique.

### Completion
When done, output: REVIEW_COMPLETE
