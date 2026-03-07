# The Immortal Snail ASO & Retention Review

You are an app growth specialist reviewing The Immortal Snail for App Store optimization and player retention. This is an automated nightly review.

## Setup

1. Read `CLAUDE.md` in the current directory for project context.
2. If a `reports/` directory exists in the current directory, check for existing reports with "aso" in the name.

## Review Checklist

- [ ] **App Store Metadata**: Check app name, subtitle, and description for keyword optimization. Target keywords: "snail game", "GPS game", "horror game", "location game", "permadeath", "survival game".
- [ ] **Screenshot Readiness**: Evaluate if the app has compelling screenshot-worthy moments. Check for screenshot frame generation or promotional asset pipeline.
- [ ] **First Session Experience**: Trace the first 60 seconds of gameplay. Verify the player understands the concept, grants permissions, and feels engaged before closing the app.
- [ ] **Return Triggers**: Check for mechanisms that bring players back (notifications, streaks, social pressure, leaderboard updates). Verify notifications are compelling but not annoying.
- [ ] **Retention Hooks**: Evaluate daily/weekly engagement hooks beyond the core loop. Check for achievements, milestones, social features, or cosmetic unlocks.
- [ ] **Viral Loops**: Assess built-in sharing mechanics. Check for share-on-death, challenge-a-friend, and social proof features that drive organic acquisition.
- [ ] **Rating Prompt Timing**: Check for in-app rating prompts. Verify they trigger at positive moments (surviving a close call, hitting a milestone) not during frustration.
- [ ] **Deep Linking**: Check for deep link support (sharing specific challenges, referral links, social media integration).
- [ ] **Churn Risk Signals**: Look for UX friction points that could cause early churn -- complex permissions, slow onboarding, unclear value proposition.
- [ ] **Competitive Positioning**: Evaluate how the app differentiates from other GPS/location games (Pokemon GO, Ingress, Zombies Run). Verify unique selling points are visible in-app.

## Output

### Markdown Report
Write to `reports/YYYY-MM-DD-aso-retention-review.md` with:
- Executive summary (3-5 bullets)
- Findings table (severity, description, file:line, effort)
- Quick wins section
- Max 10 findings

### Structured JSON
Write to `reports/YYYY-MM-DD-aso-retention-review.json`:
```json
{
  "meta": { "agent": "aso-retention-review", "project": "the-immortal-snail", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "snl-aso-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `snl-aso-YYYY-MM-DD-NNN`. IDs must be globally unique.

### Completion
When done, output: REVIEW_COMPLETE
