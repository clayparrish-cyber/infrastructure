# Agent Dashboard

Local HTML dashboard for managing agent recommendations across solo projects (SidelineIQ, Dosie).

## How It Works

1. **Agent scripts** in each project analyze content and write to `data/tasks.json`
2. **Dashboard** (`index.html`) displays recommendations, alerts, and activity
3. **User approves** via dashboard buttons (copies terminal command)
4. **Terminal command** persists approval to JSON
5. **Claude executes** approved work via `/execute-approved` or direct request
6. **Agent marks applied** with timestamp and notes

## Files

- `index.html` - Main dashboard (open directly in browser, no server needed)
- `data/tasks.json` - Canonical data store
- `data/data.js` - Browser-loadable copy (auto-generated)
- `scripts/decide.ts` - Save approval/rejection decisions
- `scripts/regenerate-js.ts` - Rebuild data.js from tasks.json
- `.claude/commands/execute-approved.md` - Slash command for executing approved work

## Data Model

```typescript
interface AgentStoreData {
  tasks: Task[]           // Agent execution records
  recommendations: Rec[]  // Pending/approved/rejected items
  alerts: Alert[]         // Urgent notifications
  lastUpdated: string
}

interface Recommendation {
  id: string
  project: "SidelineIQ" | "Dosie"
  agentType: "CONTENT" | "RESEARCH" | ...
  title: string
  recommendation: {
    action: string           // What will be done
    scope: string            // Constraints on the work
    whatApprovalMeans: string
  }
  reasoning: string
  priority: "LOW" | "MEDIUM" | "HIGH"
  humanDecision?: "APPROVED" | "REJECTED"
  decidedAt?: string
  appliedAt?: string        // Set after work is done
  executionNotes?: string   // Summary of what was done
}
```

## Workflow

### Approving a Recommendation

1. Click "Approve" in dashboard
2. Paste copied command in terminal:
   ```bash
   cd ~/Projects/agent-dashboard && npx tsx scripts/decide.ts <id> APPROVED
   ```
3. Tell Claude to execute or run `/execute-approved`

### After Executing Work

Update tasks.json with:
```json
{
  "appliedAt": "2026-01-21T...",
  "executionNotes": "Description of what was done"
}
```

Then regenerate:
```bash
npx tsx scripts/regenerate-js.ts
```

## Connected Projects

- **SidelineIQ**: `~/Projects/SidelineIQ/sideline-iq/scripts/agents/content-validation.ts`
- **Dosie**: `~/Projects/Dosie/scripts/agents/competitive-research.ts`

## Browser Compatibility

Uses `file://` protocol - no server needed. Data loaded via `<script>` tag to avoid CORS issues with `fetch()`.
