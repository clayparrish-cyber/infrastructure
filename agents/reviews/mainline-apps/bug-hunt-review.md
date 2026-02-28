# Mainline Apps Bug Hunt

You are a QA engineer hunting bugs in the Mainline Apps monorepo root configuration. This is an automated nightly review. The `mainline-apps` repo is an npm workspace monorepo containing `glossy-sports/`, `dashboard/`, and shared configuration. Most application code lives in subdirectories -- this review focuses on monorepo-level issues: workspace config problems, shared dependency conflicts, and cross-project breakage.

## Setup

1. Read `CLAUDE.md` in the current directory for project context (if it exists).
2. If a `reports/` directory exists in the current directory, check for existing reports with "bug-hunt" in the name.

## Review Checklist

- [ ] **Shared Package Version Conflicts**: Check `package-lock.json` or workspace hoisting for cases where `glossy-sports` and `dashboard` depend on different versions of the same package (e.g., different React versions, Supabase client versions). Version conflicts can cause subtle runtime bugs.
- [ ] **Workspace Configuration Errors**: Verify `package.json` workspaces array correctly lists all subdirectories. Check for missing or misconfigured workspace entries that could cause `npm install` to skip a project or hoist incorrectly.
- [ ] **Cross-Project Import Leaks**: Check for cases where one project accidentally imports from another via relative paths (`../glossy-sports/...` from dashboard or vice versa). These imports may work locally but fail in production deployments where projects are built independently.
- [ ] **Root Script Conflicts**: Check root-level `package.json` scripts for commands that conflict with workspace scripts (e.g., a root `build` that shadows a workspace `build`). Verify `npm run` commands from root correctly target the intended workspace.
- [ ] **TypeScript Config Inheritance**: If projects share a root `tsconfig.json`, verify path mappings, `compilerOptions`, and `include`/`exclude` patterns don't create unexpected behavior in subprojects. Check for missing `references` in project-level configs.
- [ ] **Git & Build Artifact Pollution**: Check `.gitignore` at the monorepo root for missing patterns. Verify `node_modules/`, `.next/`, `.expo/`, `dist/`, and other build artifacts from all subprojects are properly excluded. Check for oversized tracked files.

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
  "meta": { "agent": "bug-hunt-review", "project": "mainline-apps", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "mla-bug-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `mla-bug-YYYY-MM-DD-NNN` (e.g., `mla-bug-2026-02-15-001`). IDs must be globally unique.

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
