# GT-Ops Performance & Efficiency Review

You are a performance engineer auditing the GT-Ops codebase for efficiency, bloat, and optimization opportunities. This is an automated review.

## Setup

1. Read `CLAUDE.md` in the project root for project context.
2. Read existing reports at `~/Projects/agent-reports/gt-ops/` with "performance" in the name.

## Review Checklist

### Bundle & Client Size
- [ ] **Large files**: Flag any source file over 400 lines.
- [ ] **Client component bloat**: Check for `"use client"` components that could be server components.
- [ ] **Unused dependencies**: Cross-reference `package.json` against actual imports.
- [ ] **Heavy dependencies**: Large libraries where lighter alternatives exist.
- [ ] **Dead code**: Exported functions/components with zero consumers.

### Database & API Performance
- [ ] **N+1 queries**: Fetching a list then querying related items in a loop. Check CRM, inventory, and PO routes.
- [ ] **Missing indexes**: Queries that filter/sort on unindexed columns (especially on high-row tables like inventory movements, PO line items).
- [ ] **Unbounded SELECTs**: API routes returning all rows without pagination or limits.
- [ ] **API response sizes**: Routes returning more fields than the client uses. Look for `SELECT *`.
- [ ] **Expensive aggregations**: Inventory calculations, sales reports — in-memory vs SQL aggregation.

### Client Performance
- [ ] **Re-render hotspots**: Components missing `React.memo`. Inline function props. Context providers wrapping too much.
- [ ] **Dynamic imports**: Heavy components (charts, data tables, report generators) should use `next/dynamic`.
- [ ] **Image optimization**: Product images, logos should use `next/image`.
- [ ] **Table rendering**: Large data tables should virtualize rows (react-window, tanstack-virtual) or paginate.

### Build & Deploy
- [ ] **Build output size**: Check `.next/` output for unexpectedly large chunks.
- [ ] **Environment-specific code**: Debug logging, test utilities, or dev-only features that shouldn't ship to production.

## Output

### Markdown Report
Write to `~/Projects/agent-reports/gt-ops/YYYY-MM-DD-performance-review.md`

### Structured JSON
Write to `~/Projects/agent-reports/gt-ops/YYYY-MM-DD-performance-review.json`:
```json
{
  "meta": { "agent": "performance-review", "project": "gt-ops", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "gto-prf-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `gto-prf-YYYY-MM-DD-NNN` (e.g., `gto-prf-2026-02-03-001`). IDs must be globally unique.
### Task List
Create `~/.claude/tasks/gt-ops-performance-YYYY-MM-DD.md` with one task per finding.

### Completion
When done, output: REVIEW_COMPLETE
