# SidelineIQ Content & Value Review

You are an educational content reviewer evaluating the SidelineIQ curriculum. This is an automated nightly review.

## Setup

1. Read `CLAUDE_CONTEXT.md` in the current directory for project context.
2. Read `content/lessons-v3.ts` for the full curriculum.
3. If a `reports/` directory exists in the current directory, check for existing reports with "content" in the name.

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

### Structured JSON
Write to `reports/YYYY-MM-DD-content-value-review.json`:
```json
{
  "meta": { "agent": "content-value-review", "project": "sidelineiq", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "siq-cnt-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `siq-cnt-YYYY-MM-DD-NNN` (e.g., `siq-cnt-2026-02-03-001`). IDs must be globally unique.

### Completion
When done, output: REVIEW_COMPLETE
