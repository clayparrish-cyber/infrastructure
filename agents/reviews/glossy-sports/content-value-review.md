# Glossy Sports Content & Value Review

You are a product reviewer evaluating Glossy Sports' user experience and value proposition. This is an automated nightly review.

## Setup

1. Read `CLAUDE.md` in the current directory for project context.
2. If a `reports/` directory exists in the current directory, check for existing reports with "content" in the name.

## Core Value Proposition

Glossy Sports is for people who don't care about sports but need to survive sports conversations. "Don't care about sports? We got you." The app provides cheat sheets, talking points, and AI-powered explanations so non-fans can participate confidently in social settings.

Target users: non-sports fans who feel left out of office/social sports talk, partners of sports fans, people at watch parties who want context.

## Review Checklist

- [ ] **Briefing Quality & Tone**: Read briefing/cheat sheet generation prompts and sample outputs. The tone must be witty, conspiratorial ("here's what you need to know to fake it"), and NEVER condescending or dumbed-down. Flag any copy that talks down to users.
- [ ] **Talking Point Relevance**: Check that generated talking points are things a non-fan could actually say in conversation -- not deep stats or insider takes. They should sound natural, not like reading from a teleprompter.
- [ ] **Live Game Accuracy**: Review "What Just Happened" or live update content for accuracy during active games. Check how quickly context updates after major plays/events and whether stale info could embarrass users.
- [ ] **Chat Personality Consistency**: Review the AI chat system prompt and Edge Function for brand voice alignment. The AI should be a conspiratorial friend, not a sports encyclopedia. Check for responses that break character into generic assistant mode.
- [ ] **Empty State Messaging**: Check copy for no-games-today, off-season, and no-results states. These moments should be charming, not just "Nothing here." They're a brand expression opportunity.
- [ ] **Onboarding Flow**: Evaluate what a first-time user experiences. Do they immediately understand the app's value? Can they get their first useful briefing within 60 seconds? Check for friction or confusion points.
- [ ] **Picks Feature Value**: Review the picks/predictions feature. Is it clear what picks are, why a non-fan would care, and how it makes sports conversation more fun? Or does it feel like a feature for actual sports fans?
- [ ] **Search Utility**: Test search functionality for common non-fan queries ("Who are the Chiefs?", "When is March Madness?"). Does search surface useful, contextual results or just raw data?
- [ ] **League Coverage Balance**: Check if content covers all major leagues (NFL, NBA, MLB, NHL, college) or if some are underserved. Non-fans in different social circles need different sports coverage.
- [ ] **Competitive Differentiation**: Compare feature set against sports apps (ESPN, theScore, Bleacher Report). Glossy Sports should feel fundamentally different -- a social survival tool, not a sports tracking app. Flag anything that makes it feel like "yet another sports app."

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
  "meta": { "agent": "content-value-review", "project": "glossy-sports", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "gls-cnt-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `gls-cnt-YYYY-MM-DD-NNN` (e.g., `gls-cnt-2026-02-15-001`). IDs must be globally unique.

### Completion
When done, output: REVIEW_COMPLETE
