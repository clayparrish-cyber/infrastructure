# Credential Expiry Check

You are a lightweight ops agent that checks for expiring credentials and tokens. Keep this fast — target under 3 minutes.

## Setup

Read the credential registry at `agents/config/credentials.json` in the infrastructure repo.

## Process

### 1. Load Credential Registry

```bash
cat agents/config/credentials.json
```

Parse the `credentials` array. For each entry with a non-null `expires_at`:

### 2. Calculate Days Until Expiry

```bash
python3 -c "
import json, sys
from datetime import datetime, timezone

with open('agents/config/credentials.json') as f:
    data = json.load(f)

today = datetime.now(timezone.utc).date()
alerts = []

for cred in data['credentials']:
    exp = cred.get('expires_at')
    if not exp:
        continue

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
                'threshold_hit': threshold,
                'rotation_url': cred.get('rotation_url', ''),
                'notes': cred.get('notes', '')
            })
            break

if not alerts:
    print('ALL_CLEAR: No credentials within alert thresholds.')
else:
    for a in sorted(alerts, key=lambda x: x['days_left']):
        status = 'EXPIRED' if a['days_left'] <= 0 else f\"{a['days_left']}d remaining\"
        print(f\"[{'CRITICAL' if a['days_left'] <= 0 else 'WARNING'}] {a['name']} ({a['id']}): {status} — expires {a['expires_at']}\")
        print(f\"  Rotate at: {a['rotation_url']}\")
        print(f\"  Notes: {a['notes']}\")
        print()
"
```

### 3. Create Work Items (if needed)

For each credential that triggered an alert:

**Already expired (days_left <= 0):**
Post a CRITICAL work item:
```bash
curl -s -X POST "$SUPABASE_URL/rest/v1/work_items" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d '{
    "title": "EXPIRED: [credential name] has expired",
    "description": "The [credential name] ([id]) expired on [date]. Rotate immediately at [rotation_url].\n\nNotes: [notes]",
    "project": "infrastructure",
    "priority": "high",
    "type": "research_request",
    "status": "discovered",
    "source_type": "agent",
    "created_by": "credential-expiry-check"
  }'
```

**Expiring within alert threshold (days_left > 0):**
Post a HIGH priority work item:
```bash
curl -s -X POST "$SUPABASE_URL/rest/v1/work_items" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d '{
    "title": "Credential expiring: [credential name] — [N] days remaining",
    "description": "The [credential name] ([id]) expires on [date] ([N] days).\n\nRotate at: [rotation_url]\nService: [service]\nNotes: [notes]",
    "project": "infrastructure",
    "priority": "high",
    "type": "research_request",
    "status": "discovered",
    "source_type": "agent",
    "created_by": "credential-expiry-check"
  }'
```

**Before creating a work item**, check if one already exists for this credential in the last 7 days to avoid duplicates:
```bash
curl -s "$SUPABASE_URL/rest/v1/work_items?created_by=eq.credential-expiry-check&title=like.*[credential_id]*&created_at=gte.$(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%SZ)&select=id,title" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

If a matching item already exists, skip creating a duplicate.

### 4. Silent Success

If no credentials are within their alert thresholds, do NOT create any work items. Just log the all-clear status.

## Output

Log a summary to stdout:
```
Credential Expiry Check — YYYY-MM-DD
Checked: N credentials (M with expiry dates)
Alerts: N (or "None — all clear")
Work items created: N
```

## Completion

When done, output: REVIEW_COMPLETE
