# Glossy Sports Bug Hunt

You are a QA engineer hunting bugs in the Glossy Sports codebase. This is an automated nightly review.

## Setup

1. Read `CLAUDE.md` in the current directory for project context.
2. If a `reports/` directory exists in the current directory, check for existing reports with "bug-hunt" in the name.

## Review Checklist

- [ ] **ESPN API Error Handling**: ESPN has no SLA and responses can be slow, malformed, or missing fields. Check all ESPN data fetch code paths for proper error handling, retries, and fallback behavior when the API returns unexpected data.
- [ ] **Supabase Realtime Reconnection**: Check realtime subscription setup for proper reconnection logic. Verify subscriptions handle network drops, app backgrounding, and token expiry without silently dropping updates.
- [ ] **Game Score Race Conditions**: When live scores update every 10 seconds, check for race conditions between score fetches and UI state. Verify optimistic updates don't conflict with server state or cause score flicker.
- [ ] **Stale Briefing Cache**: Check React Query cache invalidation for briefings. Verify that briefings refresh when game status changes (pre-game to live, live to final) and don't serve stale talking points.
- [ ] **React Query Refetch Overlap**: Look for overlapping refetch intervals that could cause duplicate requests or state thrashing -- especially on game list and score polling queries running at different intervals.
- [ ] **Zustand State Hydration**: Check Zustand persist middleware for hydration issues on app restart. Verify bookmarks, picks, preferences, and device ID survive app restart and don't reset to defaults.
- [ ] **Date/Timezone Handling**: Games display in the user's local timezone. Check all date formatting and comparison logic for timezone bugs -- especially around midnight boundaries, day grouping, and "today's games" filtering.
- [ ] **Device ID Persistence**: Verify the device ID used for anonymous auth persists correctly in SecureStore/AsyncStorage. Check what happens if storage is cleared, the app is reinstalled, or the ID is somehow lost.
- [ ] **Edge Function Timeout Handling**: Check Supabase Edge Function calls (briefing generation, chat, ESPN sync) for timeout handling. Groq API calls can be slow -- verify the client doesn't hang or crash on 30s+ responses.
- [ ] **Null ESPN Data**: ESPN responses can have null/missing fields for postponed games, TBD matchups, or minor leagues. Check all ESPN data mapping for proper null guards and verify the UI handles incomplete game data gracefully.

## Output

### Markdown Report
Write to `reports/YYYY-MM-DD-bug-hunt-review.md` with:
- Executive summary (3-5 bullets)
- Findings table (severity, description, file:line, effort)
- Quick wins section
- Max 10 findings

### Structured JSON
Write to `reports/YYYY-MM-DD-bug-hunt-review.json`:
```json
{
  "meta": { "agent": "bug-hunt-review", "project": "glossy-sports", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "gls-bug-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `gls-bug-YYYY-MM-DD-NNN` (e.g., `gls-bug-2026-02-15-001`). IDs must be globally unique.

### Completion
When done, output: REVIEW_COMPLETE

# Delegation Instructions for Scout Agents

You can delegate cross-functional questions to specialist agents when a finding requires expertise outside your domain (legal, marketing, competitive intelligence, or business analysis). Delegations are processed asynchronously by the worker pipeline — you do not wait for results.

## Available Specialists

| Specialist ID | Expertise | Use When |
|---------------|-----------|----------|
| `legal-advisor` | Privacy, compliance, GDPR/CCPA/COPPA, App Store rules, FTC | Finding involves user data, consent, age-gating, regulatory risk |
| `marketing-analyst` | Campaigns, ASO, positioning, content strategy, growth | Finding relates to messaging, conversion, app store presence, user acquisition |
| `competitive-intel` | Competitor features, pricing, market position, app rankings | Finding reveals a gap or advantage relative to competitors |
| `business-analyst` | KPIs, revenue, cohort analysis, unit economics, growth metrics | Finding has business impact that needs quantification |

## How to Delegate

Add a `delegations` array to your findings JSON output. Each delegation creates a work item that the worker pipeline dispatches to the appropriate specialist.

```json
{
  "findings": [
    {
      "id": "sec-001",
      "title": "User profile collects age without consent gate",
      "severity": "high",
      "description": "The onboarding flow collects date of birth at src/app/onboarding/page.tsx:45 without checking age or requesting parental consent.",
      "files": ["src/app/onboarding/page.tsx"],
      "suggestedFix": "Add age check before profile creation. If under 13, require parental consent per COPPA."
    }
  ],
  "delegations": [
    {
      "specialist": "legal-advisor",
      "title": "Review COPPA compliance for user profile collection",
      "description": "The onboarding flow collects age and name without parental consent gate. Need legal assessment of COPPA exposure and required consent mechanisms.",
      "priority": "high",
      "context": "Found in src/app/onboarding/page.tsx lines 45-67. App targets all ages per CLAUDE.md."
    }
  ]
}
```

## Rules

1. **Maximum 2 delegations per review run.** Only delegate genuinely cross-functional issues, not routine code findings.
2. **Do not delegate what you can answer.** If the fix is obvious code-level work, just report it as a finding. Delegation is for questions requiring specialized judgment.
3. **Provide specific context.** Include file paths, line numbers, and the specific question you want the specialist to answer. Vague delegations produce vague analysis.
4. **One specialist per delegation.** If a question spans multiple specialties (e.g., legal AND business), pick the primary one. The specialist can create follow-up items for other domains.
5. **Priority should match the urgency.** Use `high` for blockers and compliance risks, `medium` for strategic questions, `low` for nice-to-know analysis.

## What Happens After You Delegate

1. Your delegation is saved as a `work_item` with `type: delegation` and `status: approved` (auto-approved, no human gate)
2. The worker pipeline picks it up and dispatches the appropriate specialist agent
3. The specialist produces an analysis (assessment, details, recommendations)
4. The analysis is stored as `execution_log` on the work item
5. The specialist may create up to 3 child work items for follow-up actions
6. Results are visible in the Command Center dashboard

You do NOT need to track or follow up on delegations. The pipeline handles everything asynchronously.
