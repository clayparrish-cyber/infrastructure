# Post-Nightly Health Check

You are an ops agent that verifies the nightly pipeline ran successfully and all services are reachable. This runs daily after the nightly review pipeline. Keep it fast — target under 5 minutes.

## Checks

### 1. GitHub Actions — Last Nightly Run

Check the most recent nightly workflow runs:

```bash
gh run list --repo clayparrish-cyber/infrastructure --workflow=nightly-review.yml --limit 3 --json status,conclusion,startedAt,updatedAt,displayTitle
```

Verify:
- The most recent run has `conclusion: "success"` or `conclusion: "failure"` (not stuck)
- The run completed within the last 24 hours
- If `conclusion: "failure"` — flag which jobs failed

If `gh` is not available, fall back to the GitHub API:
```bash
curl -s -H "Authorization: Bearer $GH_PAT" \
  "https://api.github.com/repos/clayparrish-cyber/infrastructure/actions/runs?per_page=3" \
  | python3 -c "
import json, sys
data = json.load(sys.stdin)
for run in data.get('workflow_runs', []):
    print(f\"{run['status']} | {run.get('conclusion', 'running')} | {run['created_at']} | {run['display_title']}\")
"
```

### 2. Agent Coverage — Last 24h Runs

Query Supabase for agent runs in the last 24 hours:

```bash
CUTOFF=$(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-24H +%Y-%m-%dT%H:%M:%SZ)

curl -s "$SUPABASE_URL/rest/v1/agent_runs_v2?started_at=gte.$CUTOFF&select=agent_id,project,status,started_at&order=started_at.desc" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  | python3 -c "
import json, sys
runs = json.load(sys.stdin)
print(f'Agent runs in last 24h: {len(runs)}')
agents_seen = set()
failed = []
for r in runs:
    agents_seen.add(r['agent_id'])
    if r['status'] == 'failed':
        failed.append(f\"{r['agent_id']} ({r['project']})\")

print(f'Unique agents: {len(agents_seen)}')
print(f'Agents seen: {sorted(agents_seen)}')
if failed:
    print(f'FAILED runs: {failed}')
else:
    print('No failures')
"
```

If zero runs found in 24h, this likely means the nightly pipeline didn't execute — flag as HIGH.

### 3. Service Reachability — Command Center

```bash
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://app.mainlineapps.com")
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "302" ]; then
  echo "Command Center: UP (HTTP $HTTP_CODE)"
else
  echo "ALERT: Command Center unreachable (HTTP $HTTP_CODE)"
fi
```

### 4. Supabase Health

Run a simple query to verify the database is reachable:

```bash
RESULT=$(curl -s "$SUPABASE_URL/rest/v1/work_items?select=id&limit=1" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -w "\n%{http_code}")

HTTP_CODE=$(echo "$RESULT" | tail -1)
if [ "$HTTP_CODE" = "200" ]; then
  echo "Supabase: UP (HTTP $HTTP_CODE)"
else
  echo "ALERT: Supabase unreachable (HTTP $HTTP_CODE)"
fi
```

### 5. Autonomy Pipeline Health

Check that the autonomy graduation system is functioning:

```bash
# Check if L2+ categories are accumulating shadow data
curl -s "$SUPABASE_URL/rest/v1/autonomy_rules?current_level=gte.2&select=decision_category,current_level,shadow_total,total_decisions,auto_decisions&order=decision_category" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  | python3 -c "
import json, sys
rules = json.load(sys.stdin)
issues = []

for r in rules:
    cat = r['decision_category']
    level = r['current_level']
    shadow = r['shadow_total'] or 0
    total = r['total_decisions'] or 0
    auto = r['auto_decisions'] or 0

    # L2+ with 10+ decisions but 0 shadow data = pipeline stalled
    if level >= 2 and total >= 10 and shadow == 0:
        issues.append(f'STALLED: {cat} (L{level}, {total} decisions, 0 shadow)')

    # L3 with 0 auto-decisions after 20+ total = auto-approve not firing
    if level >= 3 and total >= 20 and auto == 0:
        issues.append(f'NO_AUTO: {cat} (L{level}, {total} decisions, 0 auto-approved)')

if issues:
    print(f'AUTONOMY ISSUES ({len(issues)}):')
    for i in issues:
        print(f'  {i}')
else:
    print('Autonomy pipeline: healthy')
    l2_count = sum(1 for r in rules if r['current_level'] == 2)
    l3_count = sum(1 for r in rules if r['current_level'] == 3)
    l4_count = sum(1 for r in rules if r['current_level'] >= 4)
    print(f'  L2: {l2_count}, L3: {l3_count}, L4: {l4_count}')
"
```

If any STALLED or NO_AUTO issues found, flag as YELLOW.

### 6. Stale In-Progress Items

Check for work items stuck in `in_progress` for more than 24 hours (likely crashed workers):

```bash
CUTOFF=$(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-24H +%Y-%m-%dT%H:%M:%SZ)

curl -s "$SUPABASE_URL/rest/v1/work_items?status=eq.in_progress&updated_at=lt.$CUTOFF&select=id,title,project,updated_at&order=updated_at.asc" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  | python3 -c "
import json, sys
items = json.load(sys.stdin)
if not items:
    print('No stale in-progress items')
else:
    print(f'STALE: {len(items)} items stuck in_progress > 24h:')
    for item in items[:10]:
        print(f\"  [{item['project']}] {item['title']} (last updated: {item['updated_at']})\")
"
```

## Output

### Determine Overall Status

- **GREEN**: All checks pass, nightly succeeded, no stale items, services reachable, autonomy healthy
- **YELLOW**: Minor issues (1-2 stale items, autonomy pipeline stalls, nightly had warnings)
- **RED**: Nightly failed, services unreachable, or 3+ stale items

### If YELLOW or RED — Create Work Item

```bash
curl -s -X POST "$SUPABASE_URL/rest/v1/work_items" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d '{
    "title": "Health Check [STATUS]: [summary of issues]",
    "description": "[Detailed findings from all 5 checks]",
    "project": "infrastructure",
    "priority": "[high if RED, medium if YELLOW]",
    "type": "research_request",
    "status": "discovered",
    "source_type": "agent",
    "created_by": "post-nightly-health-check",
    "decision_category": "ops-deploy"
  }'
```

### If GREEN — Silent Success

Do not create any work items. Just log the summary to stdout.

### Log Summary

```
Post-Nightly Health Check — YYYY-MM-DD
Status: GREEN / YELLOW / RED
  Pipeline: [pass/fail]
  Agent runs (24h): N runs, N agents, N failures
  Command Center: [UP/DOWN]
  Supabase: [UP/DOWN]
  Autonomy: [healthy / N issues]
  Stale items: N
```

## Completion

When done, output: REVIEW_COMPLETE
