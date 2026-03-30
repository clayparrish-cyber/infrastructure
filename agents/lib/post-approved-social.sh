#!/bin/bash
# post-approved-social.sh — Posts approved social content to Buffer API
# Run via cron every 30 minutes, or manually after approving posts in CC
#
# Prerequisites:
#   - BUFFER_ACCESS_TOKEN in ~/.claude/.env
#   - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in ~/.claude/.env
#   - Buffer profile IDs mapped in BUFFER_PROFILES below
#
# Flow:
#   1. Query CC for work_items with status=approved, type=social_post
#   2. For each: POST to Buffer API to schedule the post
#   3. Update CC item status to done with execution_log
#   4. If Buffer fails: update status to in_progress with error in execution_log

set -euo pipefail

# Load credentials from ~/.claude/.env if running locally.
# On GitHub Actions, secrets are injected as env vars directly.
if [[ -f "$HOME/.claude/.env" ]]; then
  source "$HOME/.claude/.env"
fi

SUPABASE_KEY="${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY not set}"
BUFFER_TOKEN="${BUFFER_ACCESS_TOKEN:-}"

if [[ -z "$BUFFER_TOKEN" ]]; then
  echo "BUFFER_ACCESS_TOKEN not set. Cannot post. Exiting."
  exit 0
fi

LOG_FILE="/tmp/social-poster-$(date +%Y%m%d).log"

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $1" | tee -a "$LOG_FILE"
}

# Get Buffer profile IDs (set these after connecting accounts)
# Format: project_name=buffer_profile_id
declare -A BUFFER_PROFILES
BUFFER_PROFILES[sidelineiq]="${BUFFER_PROFILE_SIDELINEIQ:-}"
BUFFER_PROFILES[dosie]="${BUFFER_PROFILE_DOSIE:-}"

# Query CC for approved social posts
APPROVED=$(curl -s "${SUPABASE_URL}/rest/v1/work_items?status=eq.approved&type=eq.task&metadata->>is_social_post=eq.true&order=created_at.asc&limit=10" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}")

COUNT=$(echo "$APPROVED" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")

if [[ "$COUNT" == "0" ]]; then
  log "No approved social posts to process."
  exit 0
fi

log "Found ${COUNT} approved social posts to process."

# Process each approved post
echo "$APPROVED" | python3 -c "
import json, sys, subprocess, os
from datetime import datetime, timezone

items = json.load(sys.stdin)
supabase_url = os.environ['SUPABASE_URL']
supabase_key = os.environ['SUPABASE_SERVICE_ROLE_KEY']
buffer_token = os.environ.get('BUFFER_ACCESS_TOKEN', '')

for item in items:
    item_id = item['id']
    title = item['title']
    meta = item.get('metadata', {}) or {}
    project = item.get('project', '')

    # Extract post data from metadata
    caption = meta.get('caption', '')
    hashtags = meta.get('hashtags', '')
    image_url = meta.get('image_url', '')
    scheduled_time = meta.get('scheduled_time', '')
    buffer_profile = meta.get('buffer_profile_id', '')

    if not caption:
        # Try extracting from description (fallback)
        desc = item.get('description', '')
        if '## Caption' in desc:
            caption = desc.split('## Caption')[1].split('##')[0].strip()

    if not caption:
        print(f'SKIP {item_id}: No caption found in metadata or description')
        continue

    full_text = f'{caption}\n\n{hashtags}'.strip()

    # Build Buffer API payload
    payload = {
        'text': full_text,
        'profile_ids': [buffer_profile] if buffer_profile else [],
    }

    # Add scheduled time if provided
    if scheduled_time:
        payload['scheduled_at'] = scheduled_time

    # Add image if provided
    if image_url:
        payload['media'] = {'photo': image_url}

    if not payload['profile_ids']:
        print(f'SKIP {item_id}: No buffer_profile_id in metadata')
        # Update with error
        subprocess.run([
            'curl', '-s', '-X', 'PATCH',
            f'{supabase_url}/rest/v1/work_items?id=eq.{item_id}',
            '-H', f'apikey: {supabase_key}',
            '-H', f'Authorization: Bearer {supabase_key}',
            '-H', 'Content-Type: application/json',
            '-d', json.dumps({
                'execution_log': f'Missing buffer_profile_id. Set BUFFER_PROFILE_{project.upper()} in ~/.claude/.env',
                'status': 'in_progress'
            })
        ], capture_output=True)
        continue

    # POST to Buffer
    import urllib.request
    req = urllib.request.Request(
        'https://api.bufferapp.com/1/updates/create.json',
        data=json.dumps(payload).encode(),
        headers={
            'Authorization': f'Bearer {buffer_token}',
            'Content-Type': 'application/json'
        },
        method='POST'
    )

    try:
        resp = urllib.request.urlopen(req)
        result = json.loads(resp.read())
        buffer_id = result.get('updates', [{}])[0].get('id', 'unknown')

        # Update CC item to done
        subprocess.run([
            'curl', '-s', '-X', 'PATCH',
            f'{supabase_url}/rest/v1/work_items?id=eq.{item_id}',
            '-H', f'apikey: {supabase_key}',
            '-H', f'Authorization: Bearer {supabase_key}',
            '-H', 'Content-Type: application/json',
            '-d', json.dumps({
                'status': 'done',
                'execution_log': f'Posted to Buffer. ID: {buffer_id}. Scheduled: {scheduled_time or \"immediate\"}'
            })
        ], capture_output=True)
        print(f'POSTED {item_id}: {title[:60]}')
    except Exception as e:
        # Update CC item with error
        subprocess.run([
            'curl', '-s', '-X', 'PATCH',
            f'{supabase_url}/rest/v1/work_items?id=eq.{item_id}',
            '-H', f'apikey: {supabase_key}',
            '-H', f'Authorization: Bearer {supabase_key}',
            '-H', 'Content-Type: application/json',
            '-d', json.dumps({
                'execution_log': f'Buffer API error: {str(e)}',
                'status': 'in_progress'
            })
        ], capture_output=True)
        print(f'FAILED {item_id}: {str(e)[:80]}')
"

log "Processing complete."
