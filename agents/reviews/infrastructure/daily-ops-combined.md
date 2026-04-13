# Daily Operations Check (Combined)

You are a lightweight daily ops agent that performs credential monitoring, pipeline health checks, and synthesizes a morning brief. Keep this fast — target under 8 minutes total.

## Part 1: Credential Expiry Check

Read the credential registry and flag anything expiring within alert thresholds.

```bash
python3 -c "
import json
from datetime import datetime, timezone

with open('agents/config/credentials.json') as f:
    data = json.load(f)

today = datetime.now(timezone.utc).date()
alerts = []
total_with_expiry = 0

for cred in data['credentials']:
    exp = cred.get('expires_at')
    if not exp:
        continue
    total_with_expiry += 1
    exp_date = datetime.strptime(exp, '%Y-%m-%d').date()
    days_left = (exp_date - today).days

    for threshold in sorted(cred.get('alert_days', []), reverse=True):
        if days_left <= threshold:
            alerts.append({
                'id': cred['id'],
                'name': cred['name'],
                'service': cred['service'],
                'expires_at': exp,
                'days_left': days_left,
                'rotation_url': cred.get('rotation_url', ''),
                'notes': cred.get('notes', '')
            })
            break

print(f'Credentials: {len(data[\"credentials\"])} total, {total_with_expiry} with expiry dates')
if not alerts:
    print('  No credentials within alert thresholds')
else:
    for a in sorted(alerts, key=lambda x: x['days_left']):
        status = 'EXPIRED' if a['days_left'] <= 0 else f\"{a['days_left']}d remaining\"
        print(f\"  [{'CRITICAL' if a['days_left'] <= 0 else 'WARNING'}] {a['name']} ({a['id']}): {status} — expires {a['expires_at']}\")
        print(f\"    Rotate at: {a['rotation_url']}\")
"
```

For any expiring/expired credentials, check for duplicates before creating a work item:
```bash
curl -s "$SUPABASE_URL/rest/v1/work_items?created_by=eq.credential-expiry-check&title=like.*[credential_id]*&created_at=gte.$(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%SZ)&select=id,title" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Only create work items for credentials not already alerted in the last 7 days. Use `created_by: "daily-ops-combined"`, priority "high", type "research_request", status "discovered".

## Part 2: Pipeline Health

### 2a. Last Nightly Run

```bash
gh run list --repo clayparrish-cyber/infrastructure --workflow=nightly-review.yml --limit 3 --json status,conclusion,startedAt,updatedAt,displayTitle 2>/dev/null || \
curl -s -H "Authorization: Bearer $GH_PAT" \
  "https://api.github.com/repos/clayparrish-cyber/infrastructure/actions/runs?per_page=3" \
  | python3 -c "
import json, sys
data = json.load(sys.stdin)
for run in data.get('workflow_runs', []):
    print(f\"{run['status']} | {run.get('conclusion', 'running')} | {run['created_at']} | {run['display_title']}\")
"
```

### 2b. Agent Runs + Failures (48h window)

```bash
CUTOFF=$(date -u -d '48 hours ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-48H +%Y-%m-%dT%H:%M:%SZ)

curl -s "$SUPABASE_URL/rest/v1/agent_runs_v2?started_at=gte.$CUTOFF&select=agent_id,project,status,started_at&order=started_at.desc" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  | python3 -c "
import json, sys
runs = json.load(sys.stdin)
total = len(runs)
completed = sum(1 for r in runs if r['status'] == 'completed')
failed = [r for r in runs if r['status'] == 'failed']
agents_seen = set(r['agent_id'] for r in runs)
print(f'Runs (48h): {total} total, {completed} completed, {len(failed)} failed')
print(f'Unique agents: {len(agents_seen)}')
if failed:
    print('FAILED:')
    for f in failed[:5]:
        print(f\"  {f['agent_id']} ({f['project']}) at {f['started_at']}\")
"
```

### 2c. Service Reachability

```bash
CC_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://app.mainlineapps.com")
SB_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$SUPABASE_URL/rest/v1/work_items?select=id&limit=1" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")
echo "Command Center: HTTP $CC_CODE"
echo "Supabase: HTTP $SB_CODE"
```

### 2d. Stale In-Progress Items + Work Item Backlog

```bash
CUTOFF_24H=$(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-24H +%Y-%m-%dT%H:%M:%SZ)

# Stale items
curl -s "$SUPABASE_URL/rest/v1/work_items?status=eq.in_progress&updated_at=lt.$CUTOFF_24H&select=id,title,project&order=updated_at.asc&limit=10" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  | python3 -c "
import json, sys
items = json.load(sys.stdin)
print(f'Stale in_progress (>24h): {len(items)}')
for i in items[:5]:
    print(f\"  [{i['project']}] {i['title']}\")
"

# Backlog counts
curl -s "$SUPABASE_URL/rest/v1/work_items?select=status&status=not.in.(done,rejected)" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  | python3 -c "
import json, sys
from collections import Counter
items = json.load(sys.stdin)
counts = Counter(i['status'] for i in items)
print(f'Open items: {len(items)}')
for s in ['discovered', 'triaged', 'approved', 'in_progress', 'review']:
    if counts.get(s, 0) > 0:
        print(f'  {s}: {counts[s]}')
"
```

### 2e. Spend Readiness (optional — skip on failure)

```bash
curl -s --max-time 10 "${COMMAND_CENTER_URL}/api/revenue/spend-readiness" \
  -H "Authorization: Bearer $COMMAND_CENTER_API_KEY" \
  | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    print(f\"Cash balance: {data.get('cashBalance', 'N/A')}\")
except:
    print('Spend readiness: unavailable')
" 2>/dev/null
```

## Part 3: Synthesize & Post

Determine overall status:
- **GREEN**: Pipeline passed, no failures, no stale items, no credentials expiring within 7 days, services UP
- **YELLOW**: Minor issues — stale items, credentials expiring within 30 days, 1-2 failed runs
- **RED**: Pipeline failed, services down, credentials expired, or 3+ failed runs

Post the combined brief as a single work item:

```bash
curl -s -X POST "$SUPABASE_URL/rest/v1/work_items" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d '{
    "title": "Daily Ops [DATE]: [GREEN/YELLOW/RED]",
    "description": "[Combined brief: credentials + pipeline health + backlog + recommended actions]",
    "project": "infrastructure",
    "priority": "[high if RED, medium otherwise]",
    "type": "research_request",
    "status": "done",
    "source_type": "agent",
    "created_by": "daily-ops-combined",
    "decision_category": "ops-communications"
  }'
```

## Completion

When done, output: REVIEW_COMPLETE
