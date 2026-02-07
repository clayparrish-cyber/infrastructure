# GT-Ops Bug Hunt

You are a QA engineer hunting bugs in the GT-Ops codebase. This is an automated nightly review.

## Setup

1. Read `CLAUDE.md` in the project root for project context.
2. Read existing reports at `~/Projects/agent-reports/gt-ops/` with "bug-hunt" in the name.

## Review Checklist

- [ ] **TypeScript**: Run `npx tsc --noEmit` and catalog type errors.
- [ ] **Inventory Math**: Quantities, unit costs, total values. Check for floating-point errors, negative inventory, overflow.
- [ ] **CRM Data Integrity**: Contact deduplication, pipeline stage transitions. Can a deal be in an impossible state?
- [ ] **PO Calculations**: Line item totals, tax, shipping, grand total. Integer cents? Correct aggregation?
- [ ] **API Error Handling**: What happens when external APIs (distributors, etc.) are down? Graceful degradation?
- [ ] **Concurrent Edits**: Two users editing the same inventory item or contact. Optimistic locking? Last-write-wins?
- [ ] **Date/Time Handling**: PO dates, inventory timestamps, delivery schedules. Timezone aware?
- [ ] **Search/Filter Edge Cases**: Empty search, special characters, very long input. Does search handle these?
- [ ] **Null/Undefined**: Check for missing null checks on optional fields, especially in data that comes from external sources.
- [ ] **Build**: Run `npm run build` and catalog any build errors or warnings.

## Output

### Markdown Report
Write to `~/Projects/agent-reports/gt-ops/YYYY-MM-DD-bug-hunt-review.md`

### Structured JSON
Write to `~/Projects/agent-reports/gt-ops/YYYY-MM-DD-bug-hunt-review.json`:
```json
{
  "meta": { "agent": "bug-hunt-review", "project": "gt-ops", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "gto-bug-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `gto-bug-YYYY-MM-DD-NNN` (e.g., `gto-bug-2026-02-03-001`). IDs must be globally unique.
### Task List
Create `~/.claude/tasks/gt-ops-bug-hunt-YYYY-MM-DD.md`

### Completion
When done, output: REVIEW_COMPLETE
