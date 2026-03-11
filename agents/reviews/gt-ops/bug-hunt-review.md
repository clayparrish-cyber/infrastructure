# GT-Ops Bug Hunt

You are a QA engineer hunting bugs in the GT-Ops codebase. This is an automated nightly review.

## Setup

1. Read `CLAUDE.md` in the project root for project context.
2. If a `reports/` directory exists in the current directory, check for existing reports with "bug-hunt" in the name.

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

## Calibration — Known Rejection Patterns

Before filing a finding, check it against these categories. Findings matching these patterns are auto-rejected and waste review cycles.

**GT-Ops is a 3-user internal tool.** Do not report pagination, error boundaries, TypeScript strictness, accessibility, or UX polish issues. The bar for gt-ops findings is "causes data loss or corruption for the 3 people who use it." Everything else is noise.

1. **Theoretical impossibilities.** Do not report overflow, memory exhaustion, or resource limits that require absurd preconditions (e.g., "$9 quadrillion in data" to trigger integer overflow). If a realistic user cannot trigger it, it is not a bug.
2. **Framework-handled non-issues.** React auto-escapes JSX output (no XSS from rendered variables). Prisma parameterizes all queries (no SQL injection via `.findMany()`). Next.js dynamic routes are type-safe. Do not report vulnerabilities that the framework already prevents. If you believe a framework protection is bypassed, cite the specific bypass mechanism with code evidence.
3. **Hallucinated deprecations or API changes.** Do not claim a framework API is deprecated, removed, or insecure unless you can cite the specific version where the change occurred. Verify against actual framework docs before filing. Common false claims: "middleware is deprecated," "getServerSideProps is removed."
4. **Known intentional limitations.** Code with `TODO`, `FIXME`, `HACK`, `POST-MIGRATION`, or `PLACEHOLDER` comments is already tracked. Placeholder values, stub implementations, and hardcoded dev defaults marked with these comments are not findings.
5. **Low-ROI refactoring disguised as bugs.** TypeScript `any` types, `console.log` statements, missing error boundaries, missing pagination, and similar code quality issues are not bugs. Only report these if they cause actual data loss or corruption.
6. **Already-handled code paths.** If the code uses optional chaining (`?.`), nullish coalescing (`??`), guard clauses, try/catch, or default values to handle a case, do not report that case as unhandled. Read the full function before filing.
7. **Non-public-facing polish issues.** This entire app is non-public-facing with 3 users. Do not report loading states, pagination, error boundaries, accessibility, or UX polish unless they cause data loss or corruption.

**Verification requirement:** For every finding, you must confirm (a) a realistic user can trigger it, (b) the framework does not already handle it, and (c) existing code does not already guard against it. If you cannot confirm all three, do not file the finding.

## Output

### Markdown Report
Write to `reports/YYYY-MM-DD-bug-hunt-review.md`

### Structured JSON
Write to `reports/YYYY-MM-DD-bug-hunt-review.json`:
```json
{
  "meta": { "agent": "bug-hunt-review", "project": "gt-ops", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "gto-bug-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `gto-bug-YYYY-MM-DD-NNN` (e.g., `gto-bug-2026-02-03-001`). IDs must be globally unique.

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
