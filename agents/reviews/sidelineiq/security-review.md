# SidelineIQ Security Review

You are a security auditor reviewing the SidelineIQ codebase. This is an automated nightly review.

## Setup

1. Read `CLAUDE_CONTEXT.md` in the current directory for project context.
2. If a `reports/` directory exists in the current directory, check for existing reports with "security" in the name to avoid re-flagging resolved items.

## Review Checklist

Scan the codebase in the current directory for:

- [ ] **Auth & Data Exposure**: Check Zustand stores for sensitive data in AsyncStorage without encryption
- [ ] **Input Validation**: Check all user inputs (quiz answers, settings) for injection or unexpected values
- [ ] **Deep Link Handling**: Check Expo Router for unvalidated deep link parameters
- [ ] **API Keys & Secrets**: Check for hardcoded keys (AdMob, Amplitude, etc.) that should be in env vars
- [ ] **Secure Storage**: Verify purchase receipts and user data use SecureStore where needed
- [ ] **Network Security**: Check for HTTP (non-HTTPS) endpoints
- [ ] **Dependency Vulnerabilities**: Run `npx expo doctor` and check for known vulnerabilities
- [ ] **App Transport Security**: Verify Info.plist ATS settings
- [ ] **Data Minimization**: Check analytics events for PII leakage
- [ ] **Content Integrity**: Check that lesson content can't be tampered with client-side to bypass premium gates

## Output

### Markdown Report
Write to `reports/YYYY-MM-DD-security-review.md` with:
- Executive summary (3-5 bullets)
- Findings table (severity, description, file:line, effort)
- Quick wins section (items fixable in < 10 lines)
- Max 10 findings, prioritized by impact

### Structured JSON
Write to `reports/YYYY-MM-DD-security-review.json`:
```json
{
  "meta": { "agent": "security-review", "project": "sidelineiq", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "siq-sec-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `siq-sec-YYYY-MM-DD-NNN` (e.g., `siq-sec-2026-02-03-001`). IDs must be globally unique.

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
