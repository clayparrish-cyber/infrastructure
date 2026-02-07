# Dosie Bug Hunt

You are a QA engineer hunting bugs in the Dosie codebase. This is an automated nightly review.

## Setup

1. Read `CLAUDE.md` in the current directory for project context.
2. If a `reports/` directory exists in the current directory, check for existing reports with "bug-hunt" in the name.

## Project Structure

Three codebases — check all:
- `Dosie/` — SwiftUI (Core Data, local notifications)
- `apps/mobile/` — Expo/React Native (Supabase, expo-notifications)
- `web/` — Next.js (Supabase)

## Review Checklist

- [ ] **Notification Scheduling**: Escalation chain at [0, 30, 60, 180, 360] minutes. Check timezone handling, quiet hours delay logic, duplicate collapse (1-min tolerance).
- [ ] **Offline Dose Logging**: "Taken" action from notification while offline queues in AsyncStorage. Check flush-on-foreground, conflict resolution if dose was logged by another caregiver.
- [ ] **Quiet Hours**: Notifications during quiet hours delayed to quiet_hours_end + 7 minutes. What if all 5 escalation notifications fall in quiet hours? Do they all collapse to one?
- [ ] **Alternating Schedule**: Tylenol/Advil rotation logic. Does interval tracking correctly handle alternating medications for the same person?
- [ ] **Core Data Migration**: UserDefaults → Core Data migration on first launch. What if migration fails mid-way? Is there rollback?
- [ ] **Household Sync**: CloudKit sync for family sharing (if implemented). Race conditions when two caregivers log doses simultaneously?
- [ ] **Supabase Sync**: Mobile app syncs with Supabase. Check for stale data, optimistic updates that fail, offline-to-online reconnection.
- [ ] **Permission Flow**: Notification permission requested on first dose log. What if denied? Is there recovery path in settings?
- [ ] **Date/Time Handling**: Dose times across timezone changes (travel). Does the app handle DST correctly?
- [ ] **TypeScript/Swift Errors**: Run type checks on all three codebases. Catalog any type errors.

## Output

### Markdown Report
Write to `reports/YYYY-MM-DD-bug-hunt-review.md`

### Structured JSON
Write to `reports/YYYY-MM-DD-bug-hunt-review.json`:
```json
{
  "meta": { "agent": "bug-hunt-review", "project": "dosie", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "dos-bug-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `dos-bug-YYYY-MM-DD-NNN` (e.g., `dos-bug-2026-02-03-001`). IDs must be globally unique.

### Completion
When done, output: REVIEW_COMPLETE
