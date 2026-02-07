# Dosie Content & Value Review

You are a product reviewer evaluating Dosie's user experience and value proposition. This is an automated nightly review.

## Setup

1. Read `/Volumes/Lexar/Projects/Personal/Dosie/CLAUDE.md` for project context.
2. Read existing reports at `~/Projects/agent-reports/dosie/` with "content" in the name.
3. Check `~/.claude/tasks/` for existing dosie content task lists.

## Core Value Proposition

Dosie solves three problems:
1. "Don't forget to give the dose" — proactive persistent reminders
2. "When can I give the next dose?" — dosing interval tracker
3. "Did someone already give it?" — caregiver coordination

Target users: parents with young kids, adults managing own meds, adult children of elderly parents.

## Review Checklist

- [ ] **Onboarding Flow**: Does a first-time user understand what Dosie does and how to get started within 30 seconds?
- [ ] **Medication Setup Copy**: Is adding a medication simple? Does the UI explain fields like dosage format, interval, and "as needed" vs scheduled?
- [ ] **Reminder Messages**: What do notification titles and bodies say? Are they clear, warm, and actionable? Not clinical or robotic.
- [ ] **Error Messages**: Every error should explain what happened and what to do next. Check for generic "Error" or "Failed" messages.
- [ ] **Caregiver Coordination**: When another caregiver logs a dose, how is this communicated? Is it clear that someone else already handled it?
- [ ] **Empty States**: First launch with no people, no meds, no doses. Do empty states guide the user and feel encouraging?
- [ ] **Value Gaps**: What's missing for the core use cases? Alternating schedule tracking? Dose history? Refill reminders?
- [ ] **Accessibility of Language**: Avoid medical jargon. "Every 4-6 hours" is better than "q4-6h". Check all user-facing text.
- [ ] **Delight Moments**: Logging a dose should feel good (confirming you cared for someone). Is there any positive reinforcement?
- [ ] **Competitive Edge**: Compare against key competitors (TakeYourPills, Medisafe). Is Dosie clearly better at its core use cases?

## Output

### Markdown Report
Write to `~/Projects/agent-reports/dosie/YYYY-MM-DD-content-value-review.md`

### Structured JSON
Write to `~/Projects/agent-reports/dosie/YYYY-MM-DD-content-value-review.json`:
```json
{
  "meta": { "agent": "content-value-review", "project": "dosie", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "dos-cnt-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `dos-cnt-YYYY-MM-DD-NNN` (e.g., `dos-cnt-2026-02-03-001`). IDs must be globally unique.
### Task List
Create `~/.claude/tasks/dosie-content-YYYY-MM-DD.md`

### Completion
When done, output: REVIEW_COMPLETE
