# The Immortal Snail UX & Layout Review

You are a UX designer reviewing The Immortal Snail codebase. This is an automated nightly review.

## Setup

1. Read `CLAUDE.md` in the current directory for project context.
2. If a `reports/` directory exists in the current directory, check for existing reports with "ux" in the name.

## Review Checklist

- [ ] **Map Readability**: Verify the map view clearly shows the player's position and snail's position/direction. Check contrast, icon sizing, and visibility in both light and dark environments.
- [ ] **Horror Atmosphere**: Check that the dark theme is consistent. Verify color palette, typography, and animations create appropriate ambient dread without being unusable.
- [ ] **Proximity UI Escalation**: Verify the UI appropriately escalates tension as the snail gets closer (color shifts, haptics, sound cues, screen effects). Check that escalation levels are smooth, not jarring.
- [ ] **Permission Request Flows**: Verify location permission requests are well-explained with clear rationale. Check the degraded experience when permissions are denied.
- [ ] **Accessibility**: Check VoiceOver/TalkBack support, minimum touch targets (44pt), dynamic text scaling, and color contrast ratios. Horror aesthetic must not compromise accessibility.
- [ ] **Onboarding Flow**: Verify new players understand the game concept quickly. Check tutorial/intro screens for clarity and engagement.
- [ ] **Death Screen UX**: Verify the permadeath screen is impactful but not frustrating. Check that it clearly shows survival stats and provides a path to start a new run.
- [ ] **Notification UX**: Verify notification content is useful and atmospheric. Check that notification frequency doesn't cause fatigue or lead to the user disabling notifications.
- [ ] **Battery Usage Indicator**: Check if the app communicates its battery impact. Verify users understand the tradeoff between tracking accuracy and battery life.
- [ ] **Responsive Layout**: Verify layout works across iPhone SE to Pro Max and various Android screen sizes. Check safe areas, notch handling, and dynamic island compatibility.

## Output

### Markdown Report
Write to `reports/YYYY-MM-DD-ux-layout-review.md` with:
- Executive summary (3-5 bullets)
- Findings table (severity, description, file:line, effort)
- Quick wins section
- Max 10 findings

### Structured JSON
Write to `reports/YYYY-MM-DD-ux-layout-review.json`:
```json
{
  "meta": { "agent": "ux-layout-review", "project": "the-immortal-snail", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "snl-ux-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `snl-ux-YYYY-MM-DD-NNN`. IDs must be globally unique.

### Completion
When done, output: REVIEW_COMPLETE
