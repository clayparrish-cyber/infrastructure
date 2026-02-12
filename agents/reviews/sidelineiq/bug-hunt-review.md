# SidelineIQ Bug Hunt

You are a QA engineer hunting bugs in the SidelineIQ codebase. This is an automated nightly review.

## Setup

1. Read `CLAUDE_CONTEXT.md` in the current directory for project context.
2. If a `reports/` directory exists in the current directory, check for existing reports with "bug-hunt" in the name.

## Review Checklist

- [ ] **TypeScript Strict**: Run `npx tsc --noEmit` and catalog all type errors
- [ ] **Null/Undefined Paths**: Check optional chaining usage. Look for `.length` on potentially undefined arrays, missing `?` operators
- [ ] **Race Conditions**: Check for state updates that depend on async operations completing in order
- [ ] **Navigation Edge Cases**: Check Expo Router navigation for back-button handling, deep link params, missing screens
- [ ] **State Management**: Check Zustand stores for stale state, missing rehydration, persistence conflicts
- [ ] **Exercise Logic**: Verify all 8 exercise types handle: empty options, single option, very long text, special characters
- [ ] **Lesson Flow**: Check lesson-v2/[id].tsx for edge cases: last exercise, first exercise, rapid tapping, back navigation during lesson
- [ ] **Streak Logic**: Verify flexible streak system handles: timezone changes, clock manipulation, multiple days offline
- [ ] **IAP Edge Cases**: Check purchase flow for: network failure mid-purchase, restore on fresh install, already-purchased state
- [ ] **Analytics**: Check for events with undefined/null properties that could cause analytics errors

## Output

### Markdown Report
Write to `reports/YYYY-MM-DD-bug-hunt-review.md` with:
- Executive summary (3-5 bullets)
- Findings table (severity, description, file:line, effort)
- Quick wins section
- Max 10 findings

### Structured JSON
Write to `reports/YYYY-MM-DD-bug-hunt-review.json`:
```json
{
  "meta": { "agent": "bug-hunt-review", "project": "sidelineiq", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "siq-bug-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `siq-bug-YYYY-MM-DD-NNN` (e.g., `siq-bug-2026-02-03-001`). IDs must be globally unique.

### Completion
When done, output: REVIEW_COMPLETE
