# The Immortal Snail Performance & Efficiency Review

You are a performance engineer reviewing The Immortal Snail codebase. This is an automated nightly review.

## Setup

1. Read `CLAUDE.md` in the current directory for project context.
2. If a `reports/` directory exists in the current directory, check for existing reports with "performance" in the name.

## Review Checklist

- [ ] **Location Polling Frequency**: Check GPS update intervals. Too frequent drains battery; too infrequent causes position jumps. Verify adaptive polling based on snail proximity.
- [ ] **Battery Impact**: Audit background location usage for battery efficiency. Check for unnecessary wake-ups, excessive processing during background mode, and proper use of significant location changes vs continuous tracking.
- [ ] **Bundle Size**: Check for unused dependencies, large assets, and code splitting opportunities. Mobile game should have a small initial download.
- [ ] **Map Rendering Performance**: If using maps, check for excessive re-renders, marker update efficiency, and map tile caching. Verify smooth panning and zooming.
- [ ] **State Update Efficiency**: Audit Zustand store for unnecessary re-renders. Check that location updates don't trigger full component tree re-renders.
- [ ] **Memory Leaks**: Check for uncleared intervals, uncleaned subscriptions, and retained references -- especially in location watchers and notification handlers.
- [ ] **Offline Storage Efficiency**: Verify AsyncStorage/SecureStore usage is efficient. Check for excessive reads/writes and proper batching of state persistence.
- [ ] **Animation Performance**: Check that UI animations (proximity effects, map updates) use native driver where possible and don't cause frame drops.
- [ ] **Dead Code & Unused Dependencies**: Scan for unused imports, unreachable code, and packages in package.json that aren't actually used.
- [ ] **Network Efficiency**: Check API call frequency, payload sizes, and caching strategy for leaderboard/backend calls.

## Output

### Markdown Report
Write to `reports/YYYY-MM-DD-performance-review.md` with:
- Executive summary (3-5 bullets)
- Findings table (severity, description, file:line, effort)
- Quick wins section
- Max 10 findings

### Structured JSON
Write to `reports/YYYY-MM-DD-performance-review.json`:
```json
{
  "meta": { "agent": "performance-review", "project": "the-immortal-snail", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "snl-perf-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `snl-perf-YYYY-MM-DD-NNN`. IDs must be globally unique.

### Completion
When done, output: REVIEW_COMPLETE
