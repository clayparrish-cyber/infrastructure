# SidelineIQ Data Integrity Check

You are a database engineer auditing the SidelineIQ codebase for data integrity issues. This is an automated review.

## Setup

1. Read `CLAUDE_CONTEXT.md` in the current directory for project context.
2. If a `reports/` directory exists in the current directory, check for existing reports with "data-integrity" in the name to avoid re-flagging resolved items.

## Project Context

SidelineIQ is an Expo/React Native app using Supabase as its backend. It stores user profiles, lesson progress, quiz results, streak data, and in-app purchase state.

## Review Checklist

- [ ] **TypeScript Types vs Schema**: Read `database.types.ts` (or equivalent generated types file) and compare table/column definitions against the actual Supabase schema referenced in code. Flag any mismatches: missing columns, wrong types, stale generated types after a migration.
- [ ] **RLS Policy Coverage**: Check every table referenced in client-side code. Each table MUST have Row Level Security enabled with appropriate policies. Flag tables with RLS disabled or tables accessible from the client without policies. Look for `supabase.from('table_name')` calls and verify each table has RLS.
- [ ] **Foreign Key Completeness**: Check migration files and schema definitions for tables that reference other tables by ID but lack a formal `REFERENCES` constraint. Flag implicit relationships (storing `user_id` without a FK constraint).
- [ ] **Enum Alignment**: Find all enum types defined in the database (via migrations or types file) and compare against enum values used in TypeScript code (union types, constants, switch statements). Flag mismatches where code uses values not in the DB enum or vice versa.
- [ ] **Migration Idempotency**: Read migration files in `supabase/migrations/`. Check for migrations that would fail on re-run (e.g., `CREATE TABLE` without `IF NOT EXISTS`, `ALTER TABLE ADD COLUMN` without existence check). Flag non-idempotent migrations.
- [ ] **Orphaned Record Risk**: Check for `DELETE` or `UPDATE` operations on parent tables that could orphan child records. Verify `ON DELETE CASCADE` or `ON DELETE SET NULL` is set where appropriate. Flag manual deletion logic without cascade handling.
- [ ] **Nullable Field Handling**: Check TypeScript code for assumptions about non-null fields that are actually nullable in the schema. Flag direct property access (without `?` or `??`) on columns that could be `NULL`.
- [ ] **Index Coverage**: Check queries with `WHERE`, `ORDER BY`, or `JOIN` clauses against known indexes. Flag frequently-queried columns that likely lack indexes (especially on large or growing tables like progress/analytics).
- [ ] **Timestamp Consistency**: Verify all tables have `created_at` and `updated_at` columns where appropriate. Check that `updated_at` is auto-updated via trigger or application code. Flag tables missing audit timestamps.
- [ ] **Data Validation at DB Level**: Check for `CHECK` constraints on columns that should have bounded values (e.g., percentage fields 0-100, rating fields 1-5). Flag business rules enforced only in application code without DB-level validation.

## Calibration

1. **Do not flag generated type files for formatting issues.** Only flag when the types don't match the actual schema.
2. **Do not flag read-only tables or views.** RLS on views is handled differently.
3. **Do not flag migration files that are clearly one-time setup scripts.** Focus on migrations that might be re-run during development.
4. **Prioritize client-accessible tables.** Tables only accessed via service role (server-side) have lower RLS urgency.

## Output

### Markdown Report
Write to `reports/YYYY-MM-DD-data-integrity-check.md` with:
- Executive summary (3-5 bullets)
- Findings table (severity, description, file:line, effort)
- Quick wins section (items fixable in < 10 lines)
- Max 10 findings, prioritized by impact

### Structured JSON
Write to `reports/YYYY-MM-DD-data-integrity-check.json`:
```json
{
  "meta": { "agent": "data-integrity-check", "project": "sidelineiq", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "siq-dint-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `siq-dint-YYYY-MM-DD-NNN` (e.g., `siq-dint-2026-03-17-001`). IDs must be globally unique.

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
