# SidelineIQ Content & Value Review

You are an educational content reviewer evaluating the SidelineIQ curriculum. This is an automated nightly review.

## Setup

1. Read `CLAUDE_CONTEXT.md` in the current directory for project context.
2. Read `content/lessons-v3.ts` for the full curriculum.
3. If a `reports/` directory exists in the current directory, check for existing reports with "content" in the name.
4. **MANDATORY**: Read `includes/marketing-execution-guardrails.md` and follow all rules.

## QA Standards

Your review is worthless if it finds nothing. A thorough review of any non-trivial content ALWAYS finds at least one improvement opportunity. If you report zero findings:

1. You must include a "Verification Log" section listing each checklist item with 2-3 sentences explaining what you checked and why it passes. Generic "looks good" is not acceptable.
2. Consider these commonly missed issues:
   - Inconsistent terminology across content pieces (same concept called different things)
   - Missing accessibility considerations
   - Difficulty miscalibration (content too easy/hard for its target audience)
   - Stale references to events, seasons, or dates that have passed
   - CTA inconsistencies between content pieces
   - Factual claims that need verification
   - Tone drift from brand voice guidelines

## Review Checklist

- [ ] **Factual Accuracy**: Check all football facts, rules, and strategy descriptions for correctness
- [ ] **Exercise Quality**: Each exercise should test understanding, not just recall. Flag rote-memory-only questions.
- [ ] **Exercise Variety**: Each lesson should use 3+ different exercise types. Flag lessons that are all MCQ.
- [ ] **Difficulty Progression**: Tier 1 should be easier than Tier 4. Flag out-of-order difficulty.
- [ ] **Explanation Quality**: Check that explanations teach, not just reveal answers. Flag "The answer is X" without why.
- [ ] **Content Gaps**: Identify football concepts that are missing from the curriculum but would add value.
- [ ] **Engagement Hooks**: Flag lessons with no teaching cards (pure exercises without learning moments).
- [ ] **Scenario Realism**: Scenario exercises should describe plausible game situations, not contrived setups.
- [ ] **Duplicate Content**: Check for near-identical exercises across different lessons.
- [ ] **Premium Value**: Tier 4 (premium) content must feel meaningfully better than free tiers. Flag if it doesn't.

## Output

### Markdown Report
Write to `reports/YYYY-MM-DD-content-value-review.md` with:
- Executive summary (3-5 bullets)
- Findings table (severity, description, lesson/exercise, effort)
- Quick wins section
- Max 10 findings

### Plain-English Summary Requirement
Every finding must include a `plainEnglish` field that explains the issue in language a non-engineer can understand. Lead with the user or business impact, keep it to 1-2 sentences, and avoid jargon unless you immediately explain it.

Good: "People can accidentally submit the same payment twice because the confirm button stays active after the first tap."
Bad: "Missing idempotency guard on checkout mutation."

Good: "If the save request fails, someone can leave this screen thinking their changes were stored when they were actually lost."
Bad: "Optimistic UI does not reconcile failed PATCH responses."

Good: "VoiceOver users will not know what this button does because it is announced without a clear label."
Bad: "CTA lacks an accessible name."

### Structured JSON
Write to `reports/YYYY-MM-DD-content-value-review.json`:
```json
{
  "meta": { "agent": "content-value-review", "project": "sidelineiq", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "siq-cnt-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "plainEnglish": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `siq-cnt-YYYY-MM-DD-NNN` (e.g., `siq-cnt-2026-02-03-001`). IDs must be globally unique.

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
