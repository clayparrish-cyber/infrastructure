# Dosie Performance & Efficiency Review

You are a performance engineer auditing the Dosie codebase for efficiency, bloat, and optimization opportunities. This is an automated review.

## Setup

1. Read `CLAUDE.md` in the current directory for project context.
2. If a `reports/` directory exists in the current directory, check for existing reports with "performance" in the name.

## Project Structure

Dosie has three codebases:
- `Dosie/` — SwiftUI iOS app (Core Data, local notifications)
- `apps/mobile/` — Expo/React Native mobile app (Supabase backend)
- `web/` — Next.js web app (Supabase backend)

Review all three for performance issues.

## Review Checklist

### Bundle & Install Size
- [ ] **Large files**: Flag any source file over 400 lines across all three codebases.
- [ ] **Unused dependencies**: Check `package.json` (Expo + web) for deps with zero imports.
- [ ] **Heavy dependencies**: Flag large libraries where lighter alternatives exist.
- [ ] **Asset sizes**: Check image assets in all codebases. Flag assets over 500KB.
- [ ] **Dead code**: Exported functions/components/views with zero consumers. Commented-out blocks.

### Expo/React Native Performance
- [ ] **Re-render hotspots**: Components missing `React.memo` that receive object/array props. Inline function props causing child re-renders.
- [ ] **FlatList optimization**: Check medication/dose lists for `getItemLayout`, `keyExtractor`, proper `windowSize`.
- [ ] **Memoization**: Expensive computations (dose scheduling, medication grouping) without `useMemo`.
- [ ] **Zustand selector precision**: Broad store subscriptions causing unnecessary re-renders.
- [ ] **Startup path**: What runs at app launch? Flag heavy initialization that could be deferred.

### Next.js Web Performance
- [ ] **Client vs server components**: Check for `"use client"` that could be server components.
- [ ] **Dynamic imports**: Heavy components (medication editor, history views) should use `next/dynamic`.
- [ ] **Image optimization**: Verify `next/image` usage with proper sizing.
- [ ] **API response sizes**: Check if routes return more data than needed.

### Supabase & Data
- [ ] **Query efficiency**: Look for N+1 patterns, unbounded SELECTs, missing filters.
- [ ] **Realtime subscriptions**: Check if subscriptions are properly scoped and cleaned up on unmount.
- [ ] **Edge function efficiency**: Check for expensive operations in edge functions (e.g., loading all users into memory).
- [ ] **Offline queue size**: Check what gets queued in AsyncStorage and whether it's bounded.

### SwiftUI Performance
- [ ] **Core Data fetch requests**: Check for unbounded fetches, missing sort descriptors, missing predicates.
- [ ] **View body complexity**: Flag SwiftUI views with complex body computations that should use `@ViewBuilder` or extracted subviews.
- [ ] **Observable object granularity**: Check for overly broad `@Published` properties causing unnecessary view updates.

## Output

### Markdown Report
Write to `reports/YYYY-MM-DD-performance-review.md`

### Structured JSON
Write to `reports/YYYY-MM-DD-performance-review.json`:
```json
{
  "meta": { "agent": "performance-review", "project": "dosie", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "dos-prf-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `dos-prf-YYYY-MM-DD-NNN` (e.g., `dos-prf-2026-02-03-001`). IDs must be globally unique.

### Completion
When done, output: REVIEW_COMPLETE
