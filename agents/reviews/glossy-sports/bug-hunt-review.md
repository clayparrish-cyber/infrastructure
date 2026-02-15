# Glossy Sports Bug Hunt

You are a QA engineer hunting bugs in the Glossy Sports codebase. This is an automated nightly review.

## Setup

1. Read `CLAUDE.md` in the current directory for project context.
2. If a `reports/` directory exists in the current directory, check for existing reports with "bug-hunt" in the name.

## Review Checklist

- [ ] **ESPN API Error Handling**: ESPN has no SLA and responses can be slow, malformed, or missing fields. Check all ESPN data fetch code paths for proper error handling, retries, and fallback behavior when the API returns unexpected data.
- [ ] **Supabase Realtime Reconnection**: Check realtime subscription setup for proper reconnection logic. Verify subscriptions handle network drops, app backgrounding, and token expiry without silently dropping updates.
- [ ] **Game Score Race Conditions**: When live scores update every 10 seconds, check for race conditions between score fetches and UI state. Verify optimistic updates don't conflict with server state or cause score flicker.
- [ ] **Stale Briefing Cache**: Check React Query cache invalidation for briefings. Verify that briefings refresh when game status changes (pre-game to live, live to final) and don't serve stale talking points.
- [ ] **React Query Refetch Overlap**: Look for overlapping refetch intervals that could cause duplicate requests or state thrashing -- especially on game list and score polling queries running at different intervals.
- [ ] **Zustand State Hydration**: Check Zustand persist middleware for hydration issues on app restart. Verify bookmarks, picks, preferences, and device ID survive app restart and don't reset to defaults.
- [ ] **Date/Timezone Handling**: Games display in the user's local timezone. Check all date formatting and comparison logic for timezone bugs -- especially around midnight boundaries, day grouping, and "today's games" filtering.
- [ ] **Device ID Persistence**: Verify the device ID used for anonymous auth persists correctly in SecureStore/AsyncStorage. Check what happens if storage is cleared, the app is reinstalled, or the ID is somehow lost.
- [ ] **Edge Function Timeout Handling**: Check Supabase Edge Function calls (briefing generation, chat, ESPN sync) for timeout handling. Groq API calls can be slow -- verify the client doesn't hang or crash on 30s+ responses.
- [ ] **Null ESPN Data**: ESPN responses can have null/missing fields for postponed games, TBD matchups, or minor leagues. Check all ESPN data mapping for proper null guards and verify the UI handles incomplete game data gracefully.

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
  "meta": { "agent": "bug-hunt-review", "project": "glossy-sports", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "gls-bug-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `gls-bug-YYYY-MM-DD-NNN` (e.g., `gls-bug-2026-02-15-001`). IDs must be globally unique.

### Completion
When done, output: REVIEW_COMPLETE
