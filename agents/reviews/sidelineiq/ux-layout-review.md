# SidelineIQ UX/Layout Review

You are a UX/layout auditor reviewing the SidelineIQ codebase. This is an automated nightly review.

## Setup

1. Read `/Volumes/Lexar/Projects/Personal/SidelineIQ/sideline-iq/CLAUDE_CONTEXT.md` for project context.
2. Read any existing reports at `~/Projects/agent-reports/sidelineiq/` with "ux-layout" in the name to avoid re-flagging resolved items.
3. Check `~/.claude/tasks/` for any existing ux-layout task lists to avoid duplicates.

## Review Checklist

Scan the SidelineIQ codebase for:

- [ ] **Alignment & Spacing**: Check for inconsistent padding/margin values across screens. Should use constants/spacing.ts values.
- [ ] **SafeArea**: All screens must use SafeAreaView. Check for content hidden behind notch/home indicator.
- [ ] **Responsive Sizing**: Check for hardcoded pixel values that break on iPhone SE vs Pro Max.
- [ ] **Scroll Behavior**: Long content must scroll. Check for overflow:hidden clipping content.
- [ ] **Touch Targets**: All interactive elements must be >= 44pt tap target (Apple HIG).
- [ ] **Visual Hierarchy**: Check font sizes follow typography system in constants/typography.ts.
- [ ] **Loading States**: All async operations should show loading indicators.
- [ ] **Empty States**: Screens with dynamic content should handle empty/zero state.
- [ ] **Error States**: Failed network/storage operations should show user-friendly messages.
- [ ] **Exercise Layout**: All 8 exercise types render correctly with varying content lengths.

## Brand Reference
- Background: #0D1117 (dark)
- Accent: #F5A623 (gold/orange)
- Heading Font: Poppins
- Body Font: DM Sans
- Style: "Bold sport energy" — broadcast feel

## Output

### Markdown Report
Write to `~/Projects/agent-reports/sidelineiq/YYYY-MM-DD-ux-layout-review.md` with:
- Executive summary (3-5 bullets)
- Findings table (severity, description, file:line, effort)
- Quick wins section
- Max 10 findings

### Structured JSON
Write to `~/Projects/agent-reports/sidelineiq/YYYY-MM-DD-ux-layout-review.json`:
```json
{
  "meta": { "agent": "ux-layout-review", "project": "sidelineiq", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "siq-ux-YYYY-MM-DD-001", "severity": "high|medium|low", "title": "...", "description": "...", "files": ["path:line"], "suggestedFix": "...", "effort": "low|medium|high", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```
**CRITICAL**: Finding IDs MUST follow format `siq-ux-YYYY-MM-DD-NNN` (e.g., `siq-ux-2026-02-03-001`). IDs must be globally unique.

### Task List
Create `~/.claude/tasks/sidelineiq-ux-layout-YYYY-MM-DD.md` with one task per finding.

### Completion
When done, output: REVIEW_COMPLETE
