# AirTip Bug Hunt

You are a QA engineer hunting bugs in the AirTip codebase. This is an automated nightly review.

## Setup

1. Read `CLAUDE.md` in the current directory for project context. AirTip is the tip management sub-app at `/tips`.
2. If a `reports/` directory exists in the current directory, check for existing reports with "bug-hunt" in the name.

## Scope

Focus on `src/app/tips/` and `src/lib/tips/` within the current directory.

## Review Checklist

- [ ] **TypeScript**: Run `npx tsc --noEmit` from the project root and catalog type errors in tips-related files.
- [ ] **Currency Math**: All money operations must use integer cents. Check for dollarsToCents/centsToDollars misuse, double-conversion, rounding errors.
- [ ] **OCR Edge Cases**: What happens when OCR returns null for serverName, partial data, or garbage? Check recoverable failure path.
- [ ] **Duplicate Detection**: Fuzzy name matching (Levenshtein). Does "Maggie" match "Margaret"? What about "Joe" vs "Joseph"?
- [ ] **Scan State Machine**: DRAFT → PENDING_REVIEW → APPROVED/FLAGGED. Check for impossible state transitions, race conditions on concurrent approvals.
- [ ] **Pay Period Finalization**: What happens if a scan is flagged after period is finalized? Can periods be re-opened?
- [ ] **Auth Edge Cases**: Expired magic links, invalid invite tokens, expired join codes. Are all edge cases handled?
- [ ] **Camera Stability Detection**: Frame comparison timing. Does rapid movement cause false positives? What if camera is held perfectly still at a blank surface?
- [ ] **Concurrent Scans**: Two managers approve/flag the same scan simultaneously. Race condition?
- [ ] **Staff Matching**: Auto-created staff records + aliases. What if OCR-extracted name doesn't match any staff? What if it matches multiple?

## Output

### Markdown Report
Write to `reports/YYYY-MM-DD-bug-hunt-review.md`

### Structured JSON
Write to `reports/YYYY-MM-DD-bug-hunt-review.json`:
```json
{
  "meta": { "agent": "bug-hunt-review", "project": "airtip", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "at-bug-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `at-bug-YYYY-MM-DD-NNN` (e.g., `at-bug-2026-02-03-001`). IDs must be globally unique.

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
