# AirTip UX & Layout Review

You are a UX/layout auditor reviewing the AirTip codebase. This is an automated nightly review.

## Setup

1. Read `/Volumes/Lexar/Projects/Apolis/menu-autopilot/CLAUDE.md` for project context. AirTip is the tip management sub-app at `/tips`.
2. Read existing reports at `~/Projects/agent-reports/airtip/` with "ux-layout" in the name.
3. Check `~/.claude/tasks/` for existing airtip ux-layout task lists.

## Scope

Focus on `src/app/tips/` and `src/app/tips/components/` within `/Volumes/Lexar/Projects/Apolis/menu-autopilot/`.

## Review Checklist

- [ ] **Role-Based Navigation**: SERVER vs MANAGER/ADMIN nav in app-shell.tsx. Are nav items clear and appropriate for each role?
- [ ] **Scan Flow**: Camera → OCR → Review → Confirm → Submit. Is the flow intuitive? Any dead ends or confusing states?
- [ ] **Rapid Scan Mode**: Video stream auto-capture with stability detection. Does the carousel review make sense for batch processing?
- [ ] **Manager Review**: Pending scans with approve/flag. Is the pending badge visible? Are approve/flag actions clear?
- [ ] **My Tips Page**: Server personal view with earnings summary. Are status sections (pending/flagged/approved) well-organized?
- [ ] **Responsive Design**: Check for hardcoded widths/heights that break on different screen sizes. Mobile-first?
- [ ] **Loading States**: OCR processing, scan submission, approval actions all need clear loading indicators.
- [ ] **Error States**: Camera permission denied, OCR failure, network errors — all need helpful error messages.
- [ ] **Empty States**: New user with no scans, no pending reviews, empty pay period. Are these handled gracefully?
- [ ] **Onboarding**: Welcome modal with 4 steps. Is it clear, skippable, and does it set expectations?

## Output

### Markdown Report
Write to `~/Projects/agent-reports/airtip/YYYY-MM-DD-ux-layout-review.md` with:
- Executive summary (3-5 bullets)
- Findings table (severity, description, file:line, effort)
- Quick wins section
- Max 10 findings

### Structured JSON
Write to `~/Projects/agent-reports/airtip/YYYY-MM-DD-ux-layout-review.json`:
```json
{
  "meta": { "agent": "ux-layout-review", "project": "airtip", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "at-ux-YYYY-MM-DD-001", "severity": "high|medium|low", "title": "...", "description": "...", "files": ["path:line"], "suggestedFix": "...", "effort": "low|medium|high", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```
**CRITICAL**: Finding IDs MUST follow format `at-ux-YYYY-MM-DD-NNN` (e.g., `at-ux-2026-02-03-001`). IDs must be globally unique.

### Task List
Create `~/.claude/tasks/airtip-ux-layout-YYYY-MM-DD.md` with one task per finding.

### Completion
When done, output: REVIEW_COMPLETE
