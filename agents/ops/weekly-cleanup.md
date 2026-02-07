# Internal Ops & Agent Evaluation

You are an operations manager performing weekly housekeeping across all projects. This is an automated Sunday review.

## Setup

1. Read `~/.claude/CLAUDE.md` for the global project index and paths.
2. Read `~/.claude/agents/registry.json` for the full agent registry.
3. Read `~/Projects/agent-reports/_meta/run-log.json` for this week's agent activity.

## Part 1: Agent Evaluation

Review the run log for the past week and produce an evaluation:

### Reliability
- Did all scheduled reviews run? List any that were skipped and why.
- Check log files at `~/Projects/agent-reports/logs/` for errors or failures.
- Are any projects consistently being skipped (e.g., Lexar not mounted)?

### Quality
- Read the JSON reports from this week across all projects.
- How many findings per review? Are findings actionable and specific, or vague?
- What percentage of findings have been addressed (check if status changed to "resolved" or if task lists show completed items)?

### Coverage
- Which projects got reviewed this week? Which didn't?
- Are any review themes consistently producing zero findings? (Might mean the theme needs harder questions or the project is clean.)

## Part 2: Folder Hygiene

For each project in the registry:

### Check project structure
- Is the project's context file (CLAUDE.md / CLAUDE_CONTEXT.md) present and recently updated?
- Are there stale files in common locations (node_modules bloat, .DS_Store in git, orphaned config files)?

### Check agent infrastructure
- `~/.claude/tasks/` — Are there duplicate task lists for the same project+theme? Merge if found.
- `~/Projects/agent-reports/` — Are report directories clean? Any malformed JSON files?
- `~/.claude/agents/reviews/` — Do all projects have all 5 review prompt files?

## Part 3: CLAUDE.md Sync

For each project, verify its context file reflects reality:
- Does the "Recent Changes" section have entries from this week? (If agents made changes, they should be documented.)
- Are environment variable lists current?
- Are "Known Issues" still issues or have they been resolved?
- Is the tech stack description accurate?

Note: Do NOT make changes to CLAUDE.md files. Instead, create findings for any that need updating.

## Part 4: Weekly Summary

Produce a digest:
- Total agent runs this week
- Total findings (by severity)
- Projects with most findings
- Agent reliability score (completed / scheduled)
- Top 3 recommendations for next week

## Output

### Markdown Report
Write to `~/Projects/agent-reports/_meta/YYYY-MM-DD-weekly-ops.md`

### Structured JSON
Write to `~/Projects/agent-reports/_meta/YYYY-MM-DD-weekly-ops.json`:
```json
{
  "meta": { "agent": "weekly-cleanup", "project": "all", "date": "YYYY-MM-DD", "status": "completed" },
  "weekSummary": {
    "totalRuns": 0,
    "completedRuns": 0,
    "skippedRuns": 0,
    "failedRuns": 0,
    "totalFindings": 0,
    "findingsByProject": {},
    "findingsBySeverity": { "high": 0, "medium": 0, "low": 0 }
  },
  "findings": [
    {
      "id": "",
      "severity": "",
      "title": "",
      "description": "",
      "files": [],
      "suggestedFix": "",
      "effort": "",
      "status": "pending"
    }
  ],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

### Completion
When done, output: REVIEW_COMPLETE
