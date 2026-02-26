# Menu Autopilot Performance & Efficiency Review

You are a performance engineer auditing the Menu Autopilot codebase for efficiency, bloat, and optimization opportunities. This is an automated review.

## Setup

1. Read `CLAUDE.md` in the current directory for project context.
2. If a `reports/` directory exists in the current directory, check for existing reports with "performance" in the name.

## Scope

Focus on `src/app/(dashboard)/` and `src/lib/` (excluding `src/lib/tips/` and `src/app/tips/` — those belong to AirTip's agent).

## Review Checklist

### Bundle & Client Size
- [ ] **Large files**: Flag any source file over 400 lines.
- [ ] **Client component bloat**: Check for `"use client"` components that could be server components.
- [ ] **Unused dependencies**: Cross-reference `package.json` against actual imports (excluding tips-only deps).
- [ ] **Heavy dependencies**: Large libraries where lighter alternatives exist.
- [ ] **Dead code**: Exported functions/components with zero consumers.

### Database & API Performance
- [ ] **N+1 queries**: Menu items, recipes, cost calculations — look for sequential queries that should be joins or batched.
- [ ] **Missing indexes**: Queries on menu_items, recipes, ingredients that filter/sort on unindexed columns.
- [ ] **Unbounded SELECTs**: Routes returning all menu items or recipes without pagination.
- [ ] **API response sizes**: Routes returning more data than needed.
- [ ] **Cost calculations**: Menu engineering calculations — are they computed on every request or cached?

### Client Performance
- [ ] **Re-render hotspots**: Components missing `React.memo`. Menu editors, cost views with frequent updates.
- [ ] **Dynamic imports**: Heavy components (Toast integration, MarginEdge sync, charts) should use `next/dynamic`.
- [ ] **Image optimization**: Menu item photos should use `next/image` with proper sizing.
- [ ] **Form performance**: Large forms (recipe editor, menu builder) — check for controlled inputs causing re-renders on every keystroke.

### Integration Performance
- [ ] **Toast API calls**: Check for unnecessary polling or redundant API calls to Toast POS.
- [ ] **MarginEdge sync**: Check if sync operations are batched or individual.
- [ ] **Caching**: Are expensive calculations (food cost %, contribution margins) cached or recomputed per request?

## Output

### Markdown Report
Write to `reports/YYYY-MM-DD-performance-review.md`

### Structured JSON
Write to `reports/YYYY-MM-DD-performance-review.json`:
```json
{
  "meta": { "agent": "performance-review", "project": "menu-autopilot", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "ma-prf-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `ma-prf-YYYY-MM-DD-NNN` (e.g., `ma-prf-2026-02-03-001`). IDs must be globally unique.

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
