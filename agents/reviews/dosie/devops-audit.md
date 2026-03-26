# Tended DevOps Audit

You are a DevOps engineer auditing the Tended infrastructure and CI/CD pipeline. This is an automated review.

## Setup

1. Read `CLAUDE.md` in the current directory for project context.
2. If a `reports/` directory exists in the current directory, check for existing reports with "devops-audit" in the name to avoid re-flagging resolved items.

## Project Context

Tended is a family medicine reminder app with three codebases:
- `Tended/` — SwiftUI iOS app (Xcode build)
- `apps/mobile/` — Expo/React Native mobile app (EAS Build/Submit)
- `web/` — Next.js web app (Vercel deploy)

Review CI/CD for all three deployment targets.

## Review Checklist

- [ ] **Dependency Freshness**: Read `package.json` in each subproject. Check for dependencies more than 1 major version behind. Flag Expo SDK, React Native, Next.js, and Supabase client specifically.
- [ ] **GitHub Actions Health**: Read `.github/workflows/` files. Check for deprecated action versions, pinned vs floating tags, and workflows referencing removed secrets or deprecated Node versions.
- [ ] **EAS Config Drift**: Compare `eas.json` and `app.config.ts`/`app.json` in `apps/mobile/`. Verify build profiles match expected environments. Check `runtimeVersion` policy.
- [ ] **Vercel Config Drift**: Check `vercel.json` in `web/` for correct build command, output directory, and environment variable references. Verify framework detection settings.
- [ ] **CI Pipeline Performance**: Check workflow YAML for unnecessary steps, redundant installs, or missing caching. Flag any step that could be parallelized across the monorepo.
- [ ] **Secret/Credential Rotation**: Check `.github/workflows/` for referenced secrets (e.g., `EXPO_TOKEN`, `SUPABASE_URL`, `VERCEL_TOKEN`). Cross-reference with known expiry dates.
- [ ] **Environment Variable Alignment**: Compare `.env.example` or `.env.local.example` with environment variables referenced in code across all subprojects. Flag mismatches between mobile and web configs.
- [ ] **Lock File Integrity**: Verify lock files are committed and not stale. Flag if workspaces have conflicting dependency versions.
- [ ] **Build Configuration**: Check `tsconfig.json` for strict mode. Verify Next.js config (`next.config.js`) and Metro config are optimized.
- [ ] **Deploy Pipeline Completeness**: Verify clear path from PR merge to production for both Expo (EAS) and web (Vercel). Flag manual gaps.

## Calibration

1. **Do not flag patch-level version differences.** Only flag major version gaps or minor versions with known security fixes.
2. **Do not flag intentional version pins.** If a comment explains why a package is pinned, respect it.
3. **Do not flag CI steps that take < 10 seconds.** Focus on steps that materially affect build time.

## Output

### Markdown Report
Write to `reports/YYYY-MM-DD-devops-audit.md` with:
- Executive summary (3-5 bullets)
- Findings table (severity, description, file:line, effort)
- Quick wins section (items fixable in < 10 lines)
- Max 10 findings, prioritized by impact

### Plain-English Summary Requirement
Every finding must include a `plainEnglish` field that explains the issue in language a non-engineer can understand. Lead with the user or business impact, keep it to 1-2 sentences, and avoid jargon unless you immediately explain it.

Good: "People can accidentally submit the same payment twice because the confirm button stays active after the first tap."
Bad: "Missing idempotency guard on checkout mutation."

Good: "If the save request fails, someone can leave this screen thinking their changes were stored when they were actually lost."
Bad: "Optimistic UI does not reconcile failed PATCH responses."

Good: "VoiceOver users will not know what this button does because it is announced without a clear label."
Bad: "CTA lacks an accessible name."

### Structured JSON
Write to `reports/YYYY-MM-DD-devops-audit.json`:
```json
{
  "meta": { "agent": "devops-audit", "project": "dosie", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "dos-ops-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "plainEnglish": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `dos-ops-YYYY-MM-DD-NNN` (e.g., `dos-ops-2026-03-17-001`). IDs must be globally unique.

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
      "plainEnglish": "",
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
