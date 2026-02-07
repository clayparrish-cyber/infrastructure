# Menu Autopilot UX & Layout Review

You are a UX/layout auditor reviewing the Menu Autopilot codebase. This is an automated nightly review.

## Setup

1. Read `/Volumes/Lexar/Projects/Apolis/menu-autopilot/CLAUDE.md` for project context.
2. Read existing reports at `~/Projects/agent-reports/menu-autopilot/` with "ux-layout" in the name.
3. Check `~/.claude/tasks/` for existing menu-autopilot ux-layout task lists.

## Scope

Focus on `src/app/(dashboard)/` and `src/components/`. Exclude AirTip UI (separate agent).

## Brand Reference

Menu Autopilot: Blue (#3B82F6) primary, Green (#10B981) accent, White (#FFFFFF) background, Inter font. Professional B2B SaaS for restaurant owners and GMs.

## Review Checklist

- [ ] **Dashboard**: Key metrics (top items, margin alerts, weekly trends) visible at a glance for a busy GM.
- [ ] **Menu Item Management**: Adding, editing, viewing items. Clear cost/margin/sales data presentation.
- [ ] **Recipe Builder**: Ingredient management, cost roll-up. Is the flow intuitive for a non-technical restaurant manager?
- [ ] **Report Views**: Weekly reports, recommendations. Actionable and scannable?
- [ ] **Data Import Flow**: Toast sync, MarginEdge sync, CSV upload. Clear progress, success/failure feedback.
- [ ] **Responsive Design**: Should work on desktop (primary) and tablet (GM walking the floor).
- [ ] **Data Tables**: Menu items, ingredients, recipes. Sorting, filtering, search. Manageable with 100+ items?
- [ ] **Loading States**: API syncs, report generation. Clear progress indicators.
- [ ] **Empty States**: New account, no data yet. Guided onboarding to connect data sources?
- [ ] **Error States**: API connection failures, import errors. Helpful messages that a restaurant manager can act on.

## Output

### Markdown Report
Write to `~/Projects/agent-reports/menu-autopilot/YYYY-MM-DD-ux-layout-review.md`

### Structured JSON
Write to `~/Projects/agent-reports/menu-autopilot/YYYY-MM-DD-ux-layout-review.json`:
```json
{
  "meta": { "agent": "ux-layout-review", "project": "menu-autopilot", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "ma-ux-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `ma-ux-YYYY-MM-DD-NNN` (e.g., `ma-ux-2026-02-03-001`). IDs must be globally unique.
### Task List
Create `~/.claude/tasks/menu-autopilot-ux-layout-YYYY-MM-DD.md`

### Completion
When done, output: REVIEW_COMPLETE
