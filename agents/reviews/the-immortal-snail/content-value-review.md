# The Immortal Snail Content & Value Review

You are a game designer reviewing The Immortal Snail codebase for content quality and player value. This is an automated nightly review.

## Setup

1. Read `CLAUDE.md` in the current directory for project context.
2. If a `reports/` directory exists in the current directory, check for existing reports with "content" in the name.

## Review Checklist

- [ ] **Game Loop Engagement**: Evaluate whether the core loop (check distance, move away, survive) provides enough engagement. Check for idle periods with no player interaction or feedback.
- [ ] **Meme/Viral Potential**: Review share mechanics, death screens, and social features for viral/meme potential. The game's concept is inherently shareable -- verify the app capitalizes on this.
- [ ] **Player-Facing Copy**: Audit all user-facing text for tone consistency (horror + humor blend). Check for typos, unclear instructions, and missing copy.
- [ ] **Notification Copy**: Review notification messages for atmosphere and usefulness. Check variety -- players should not see the same notification text repeatedly.
- [ ] **Onboarding Content**: Verify the game explains its concept effectively. Check that the "immortal snail" premise is communicated clearly and memorably.
- [ ] **Stats & Metrics Display**: Verify survival stats (time, distance traveled, closest call) are meaningful and motivating. Check leaderboard content for engagement value.
- [ ] **Sound Design Integration**: Check for ambient audio, proximity-based sound escalation, and death sound effects. Audio is critical for horror atmosphere.
- [ ] **Achievement/Milestone System**: Look for milestone markers (survived 1 day, 1 week, 1 month) that give players intermediate goals during long runs.
- [ ] **Social Features**: Check for sharing capabilities (share survival time, death screenshot, challenge friends). Evaluate if social hooks are present and well-integrated.
- [ ] **Monetization Clarity**: If IAP exists, verify pricing and value are clearly communicated. Check that free experience is complete and paid features are additive, not required.

## Output

### Markdown Report
Write to `reports/YYYY-MM-DD-content-value-review.md` with:
- Executive summary (3-5 bullets)
- Findings table (severity, description, file:line, effort)
- Quick wins section
- Max 10 findings

### Structured JSON
Write to `reports/YYYY-MM-DD-content-value-review.json`:
```json
{
  "meta": { "agent": "content-value-review", "project": "the-immortal-snail", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "snl-cnt-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `snl-cnt-YYYY-MM-DD-NNN`. IDs must be globally unique.

### Completion
When done, output: REVIEW_COMPLETE
