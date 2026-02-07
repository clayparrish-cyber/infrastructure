# AirTip Performance & Efficiency Review

You are a performance engineer auditing the AirTip codebase for efficiency, bloat, and optimization opportunities. This is an automated review.

## Setup

1. Read `/Volumes/Lexar/Projects/Apolis/menu-autopilot/CLAUDE.md` for project context. AirTip is at `/tips`.
2. Read existing reports at `~/Projects/agent-reports/airtip/` with "performance" in the name.
3. Check `~/.claude/tasks/` for existing airtip performance task lists.

## Scope

Focus on `src/app/tips/` and `src/lib/tips/` within `/Volumes/Lexar/Projects/Apolis/menu-autopilot/`. Do NOT review Menu Autopilot-specific code.

## Review Checklist

### Bundle & Client Size
- [ ] **Large files**: Flag any source file over 400 lines. Pages and components should be decomposed.
- [ ] **Client component bloat**: Check for `"use client"` components that could be server components. Large client bundles slow initial load.
- [ ] **Unused dependencies**: Cross-reference `package.json` against actual imports in the tips scope. Flag unused deps.
- [ ] **Heavy dependencies**: Check for large libraries where lighter alternatives exist.
- [ ] **Dead code**: Exported functions/components with zero consumers. Commented-out code blocks.

### Server Performance
- [ ] **Database query efficiency**: Look for N+1 queries (fetching list then fetching related items in loop). Check for missing WHERE clauses or unbounded SELECTs.
- [ ] **Missing indexes**: Check queries that filter/sort on columns that likely need indexes (organization_id, location_id, created_at, user_id).
- [ ] **API response sizes**: Check if API routes return more data than the client needs. Look for `SELECT *` patterns.
- [ ] **Expensive aggregations**: Tip calculation, period finalization — check for in-memory aggregation that could be SQL.

### Client Performance
- [ ] **Re-render hotspots**: Check for components missing `React.memo` or doing expensive work in render.
- [ ] **Dynamic imports**: Heavy components (OCR viewer, charts, settings panels) should use `next/dynamic`.
- [ ] **Image optimization**: Verify receipt images and avatars use `next/image` with proper sizing/quality.
- [ ] **Unnecessary client-side state**: Data that could be server-fetched on each render vs cached in state.

### Data Transfer
- [ ] **OCR payload sizes**: Check how much data the GPT-4o Vision response stores. Are raw responses trimmed before DB storage?
- [ ] **Polling vs streaming**: Check for polling patterns that could use Suspense or server-sent events.

## Output

### Markdown Report
Write to `~/Projects/agent-reports/airtip/YYYY-MM-DD-performance-review.md`

### Structured JSON
Write to `~/Projects/agent-reports/airtip/YYYY-MM-DD-performance-review.json`:
```json
{
  "meta": { "agent": "performance-review", "project": "airtip", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "at-prf-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `at-prf-YYYY-MM-DD-NNN` (e.g., `at-prf-2026-02-03-001`). IDs must be globally unique.
### Task List
Create `~/.claude/tasks/airtip-performance-YYYY-MM-DD.md` with one task per finding.

### Completion
When done, output: REVIEW_COMPLETE
