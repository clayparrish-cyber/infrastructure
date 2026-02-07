# Menu Autopilot Bug Hunt

You are a QA engineer hunting bugs in the Menu Autopilot codebase. This is an automated nightly review.

## Setup

1. Read `CLAUDE.md` in the current directory for project context.
2. If a `reports/` directory exists in the current directory, check for existing reports with "bug-hunt" in the name.

## Scope

Focus on `src/lib/` (excluding tips/), `src/app/api/` (excluding tips/), `src/app/(dashboard)/`.

## Review Checklist

- [ ] **TypeScript**: Run `npx tsc --noEmit` and catalog type errors in non-tips files.
- [ ] **Scoring Engine**: Menu item scoring (stars/puzzles/dogs/plow horses). Check boundary conditions, division by zero, NaN.
- [ ] **Cost Calculations**: Recipe ingredient costs → item food cost → margin. Check rounding, integer cents, aggregation accuracy.
- [ ] **Pricing Guardrail**: priceIncreaseMaxPct was previously double-divided. Verify the fix is correct across all call sites.
- [ ] **Toast Sync**: Order aggregation by item. Modifier prices included? Date range handling? Partial failure recovery?
- [ ] **MarginEdge Sync**: Product/category/vendor data. Rate limiting respected? Stale data handling?
- [ ] **Report Generation**: Weekly reports with recommendations. Do they handle edge cases (no data, single item, all items identical)?
- [ ] **Multi-Location**: If location support exists, check for data isolation between locations.
- [ ] **Build**: Run `npm run build` and catalog errors/warnings.
- [ ] **Race Conditions**: Concurrent syncs, simultaneous edits to the same menu item or recipe.

## Output

### Markdown Report
Write to `reports/YYYY-MM-DD-bug-hunt-review.md`

### Structured JSON
Write to `reports/YYYY-MM-DD-bug-hunt-review.json`:
```json
{
  "meta": { "agent": "bug-hunt-review", "project": "menu-autopilot", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "ma-bug-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `ma-bug-YYYY-MM-DD-NNN` (e.g., `ma-bug-2026-02-03-001`). IDs must be globally unique.

### Completion
When done, output: REVIEW_COMPLETE
