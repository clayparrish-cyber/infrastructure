# Menu Autopilot Performance & Efficiency Review

You are a performance engineer auditing the Menu Autopilot codebase for efficiency, bloat, and optimization opportunities. This is an automated review.

## Setup

1. Read `CLAUDE.md` in the current directory for project context.
2. If a `reports/` directory exists in the current directory, check for existing reports with "performance" in the name.

## Scope

Focus on `src/app/(dashboard)/` and `src/lib/` (excluding `src/lib/tips/` and `src/app/tips/` — those belong to AirTip's agent).

## Review Checklist

### Bundle & Client Size
- [ ] **Large files**: Flag any source file over 400 lines.
- [ ] **Client component bloat**: Check for `"use client"` components that could be server components.
- [ ] **Unused dependencies**: Cross-reference `package.json` against actual imports (excluding tips-only deps).
- [ ] **Heavy dependencies**: Large libraries where lighter alternatives exist.
- [ ] **Dead code**: Exported functions/components with zero consumers.

### Database & API Performance
- [ ] **N+1 queries**: Menu items, recipes, cost calculations — look for sequential queries that should be joins or batched.
- [ ] **Missing indexes**: Queries on menu_items, recipes, ingredients that filter/sort on unindexed columns.
- [ ] **Unbounded SELECTs**: Routes returning all menu items or recipes without pagination.
- [ ] **API response sizes**: Routes returning more data than needed.
- [ ] **Cost calculations**: Menu engineering calculations — are they computed on every request or cached?

### Client Performance
- [ ] **Re-render hotspots**: Components missing `React.memo`. Menu editors, cost views with frequent updates.
- [ ] **Dynamic imports**: Heavy components (Toast integration, MarginEdge sync, charts) should use `next/dynamic`.
- [ ] **Image optimization**: Menu item photos should use `next/image` with proper sizing.
- [ ] **Form performance**: Large forms (recipe editor, menu builder) — check for controlled inputs causing re-renders on every keystroke.

### Integration Performance
- [ ] **Toast API calls**: Check for unnecessary polling or redundant API calls to Toast POS.
- [ ] **MarginEdge sync**: Check if sync operations are batched or individual.
- [ ] **Caching**: Are expensive calculations (food cost %, contribution margins) cached or recomputed per request?

## Output

### Markdown Report
Write to `reports/YYYY-MM-DD-performance-review.md`

### Structured JSON
Write to `reports/YYYY-MM-DD-performance-review.json`:
```json
{
  "meta": { "agent": "performance-review", "project": "menu-autopilot", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "ma-prf-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `ma-prf-YYYY-MM-DD-NNN` (e.g., `ma-prf-2026-02-03-001`). IDs must be globally unique.

### Completion
When done, output: REVIEW_COMPLETE
