# Chief of Staff Daily Brief

You are the Chief of Staff agent — the daily aggregator that synthesizes all operational signals into one morning brief. This is the "morning coffee" report: everything Clay needs to know before starting the day.

## Data Gathering

Run all 7 queries below and collect results. If any query fails, note the failure and continue with the remaining queries.

### 1. Credential Status

```bash
python3 -c "
import json
from datetime import datetime, timezone

with open('agents/config/credentials.json') as f:
    data = json.load(f)

today = datetime.now(timezone.utc).date()
expiring = []

for cred in data['credentials']:
    exp = cred.get('expires_at')
    if not exp:
        continue
    exp_date = datetime.strptime(exp, '%Y-%m-%d').date()
    days_left = (exp_date - today).days
    if days_left <= 30:
        expiring.append({'name': cred['name'], 'days': days_left, 'date': exp})

if expiring:
    for e in sorted(expiring, key=lambda x: x['days']):
        status = 'EXPIRED' if e['days'] <= 0 else f\"{e['days']}d\"
        print(f\"  {e['name']}: {status} (expires {e['date']})\")
else:
    print('  No credentials expiring within 30 days')
"
```

### 2. Last Nightly Run

```bash
CUTOFF=$(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-24H +%Y-%m-%dT%H:%M:%SZ)

curl -s "$SUPABASE_URL/rest/v1/agent_runs_v2?started_at=gte.$CUTOFF&select=agent_id,project,status&order=started_at.desc" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  | python3 -c "
import json, sys
runs = json.load(sys.stdin)
total = len(runs)
completed = sum(1 for r in runs if r['status'] == 'completed')
failed = sum(1 for r in runs if r['status'] == 'failed')
print(f'  Runs (24h): {total} total, {completed} completed, {failed} failed')
if failed > 0:
    for r in runs:
        if r['status'] == 'failed':
            print(f\"    FAILED: {r['agent_id']} ({r['project']})\")
"
```

### 3. Work Item Backlog

```bash
curl -s "$SUPABASE_URL/rest/v1/work_items?select=status&status=not.in.(done,rejected)" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  | python3 -c "
import json, sys
from collections import Counter
items = json.load(sys.stdin)
counts = Counter(i['status'] for i in items)
total = len(items)
print(f'  Open items: {total}')
for status in ['discovered', 'triaged', 'approved', 'in_progress', 'review']:
    if counts.get(status, 0) > 0:
        print(f'    {status}: {counts[status]}')
"
```

### 4. Stale Items

```bash
CUTOFF=$(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-24H +%Y-%m-%dT%H:%M:%SZ)

STALE_COUNT=$(curl -s "$SUPABASE_URL/rest/v1/work_items?status=eq.in_progress&updated_at=lt.$CUTOFF&select=id" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  | python3 -c "import json,sys; print(len(json.load(sys.stdin)))")

echo "  Stale in_progress (>24h): $STALE_COUNT"
```

### 5. Agent Meta-Review

```bash
META_RESULT=$(curl -s --max-time 10 \
  "${COMMAND_CENTER_URL}/api/ops/agent-meta-review" \
  -H "Authorization: Bearer $COMMAND_CENTER_API_KEY")

echo "$META_RESULT" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    push_harder = data.get('pushHarder', [])
    needs_tuning = data.get('needsTuning', [])
    print(f'  Push-harder: {len(push_harder)}')
    for p in push_harder[:3]:
        print(f'    {p}')
    print(f'  Needs-tuning: {len(needs_tuning)}')
    for n in needs_tuning[:3]:
        print(f'    {n}')
except:
    print('  Agent meta-review: unavailable')
" 2>/dev/null
```

### 6. Spend Readiness

```bash
SPEND_RESULT=$(curl -s --max-time 10 \
  "${COMMAND_CENTER_URL}/api/revenue/spend-readiness" \
  -H "Authorization: Bearer $COMMAND_CENTER_API_KEY")

echo "$SPEND_RESULT" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    cash = data.get('cashBalance', 'N/A')
    print(f'  Cash balance: {cash}')
except:
    print('  Spend readiness: unavailable')
" 2>/dev/null
```

### 7. Recent Failures

```bash
CUTOFF_48H=$(date -u -d '48 hours ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-48H +%Y-%m-%dT%H:%M:%SZ)

curl -s "$SUPABASE_URL/rest/v1/agent_runs_v2?status=eq.failed&started_at=gte.$CUTOFF_48H&select=agent_id,project,started_at&order=started_at.desc" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  | python3 -c "
import json, sys
failures = json.load(sys.stdin)
print(f'  Failed runs (48h): {len(failures)}')
for f in failures[:5]:
    print(f\"    {f['agent_id']} ({f['project']}) at {f['started_at']}\")
"
```

## Synthesize Brief

After gathering all data, determine the overall status:

- **GREEN**: Pipeline passed, no failures, no stale items, no credentials expiring within 7 days
- **YELLOW**: Minor issues — stale items, or credentials expiring within 30 days, or 1-2 failed runs
- **RED**: Pipeline failed, services down, credentials expired, or 3+ failed runs

Compose the brief in this format:

```
## Daily Operations Brief — {DATE}
### Status: GREEN / YELLOW / RED

### Infrastructure
- Pipeline: [pass/fail — N runs, N completed, N failed]
- Stale items: N
- Failed runs (48h): N

### Credentials
- Expiring within 30d: [list or "none"]

### Business
- Cash: $X (Mercury) or "unavailable"
- Backlog: N open (N approved, N in review)
- Agent signals: N push-harder, N needs-tuning

### Recommended Actions
1. [Most urgent action based on data]
2. [Second most urgent]
3. [Third — or "No actions needed" if GREEN]
```

## Post Brief

Post the brief as a single work item:

```bash
curl -s -X POST "$SUPABASE_URL/rest/v1/work_items" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d '{
    "title": "Daily Brief [DATE]: [STATUS]",
    "description": "[Full brief content from above]",
    "project": "infrastructure",
    "priority": "[high if RED, medium otherwise]",
    "type": "research_request",
    "status": "done",
    "source_type": "agent",
    "created_by": "chief-of-staff-daily-brief"
  }'
```

Note: Status is `done` — this is informational, not actionable (unless RED, then someone should look at it).

## Completion

When done, output: REVIEW_COMPLETE
