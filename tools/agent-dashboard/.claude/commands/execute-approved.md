# Execute Approved Recommendations

Execute work items that have been approved in the agent dashboard.

## How It Works

1. Reads approved recommendations from `~/Projects/agent-dashboard/data/tasks.json`
2. For each approved recommendation, executes the specified action
3. Marks recommendations as completed after execution

## How to Run

```bash
# First, read the approved recommendations
cat ~/Projects/agent-dashboard/data/tasks.json | jq '.recommendations[] | select(.humanDecision == "APPROVED")'
```

Then for each approved recommendation:

1. **Read the recommendation details** - understand the action and scope
2. **Navigate to the correct project** - based on the `project` field
3. **Execute the work** - following the `scope` constraints
4. **Update the recommendation** - mark as applied with timestamp

## Execution Guidelines

For **SidelineIQ content recommendations**:
- Work in `~/Projects/SidelineIQ/sideline-iq/content/lessons-v3.ts`
- Follow the existing exercise format patterns
- Respect the scope constraints (e.g., "add to existing lessons" vs "create new lessons")

For **other projects**:
- Read the project's CLAUDE.md for context
- Follow existing patterns in the codebase

## After Execution

Update the recommendation in tasks.json:
```json
{
  "humanDecision": "APPROVED",
  "appliedAt": "2026-01-21T...",
  "executionNotes": "Added X exercises to lessons Y, Z"
}
```

Then regenerate data.js so the dashboard reflects the changes:
```bash
cd ~/Projects/agent-dashboard && npx tsx scripts/regenerate-js.ts
```

## Example Session

```
User: /execute-approved
Claude: Let me check for approved recommendations...

Found 2 approved recommendations:
1. [SidelineIQ] Add 17 more fillBlank exercises
2. [SidelineIQ] Add 4 new lessons to Tier 1

Starting with #1: Add 17 fillBlank exercises...
[Claude executes the work]

Done. Marking as completed.
```
