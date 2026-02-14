#!/bin/bash
# Work Loop Manager — Dispatches worker agents for approved work items
# Runs in GitHub Actions after nightly scout reviews + sync
# Usage: ./work-loop-manager.sh [--max-items N]
#
# Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
# Optional env vars: PROJECTS_DIR, WORKER_PROMPT, REGISTRY, LOG_DIR, EXECUTION_MODE

set -euo pipefail

MAX_ITEMS="${MAX_WORKER_ITEMS:-5}"
EXECUTION_MODE="${EXECUTION_MODE:-dry_run}"
PROJECTS_DIR="${PROJECTS_DIR:-projects}"
WORKER_PROMPT="${WORKER_PROMPT:-agents/workers/implement-finding.md}"
REGISTRY="${REGISTRY:-agents/registry.json}"
LOG_DIR="${LOG_DIR:-logs}"
DATE=$(date +%Y-%m-%d)

while [ $# -gt 0 ]; do
  case "$1" in
    --max-items)
      MAX_ITEMS="${2:-$MAX_ITEMS}"
      shift 2
      ;;
    --live)
      EXECUTION_MODE="live"
      shift
      ;;
    --dry-run)
      EXECUTION_MODE="dry_run"
      shift
      ;;
    *)
      shift
      ;;
  esac
done

mkdir -p "$LOG_DIR"

# Load env vars from local files when shell vars are not already set.
SUPABASE_URL="${SUPABASE_URL:-}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"

load_env_file() {
  local env_file="$1"
  [ -f "$env_file" ] || return 0

  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ''|\#*) continue ;;
    esac

    local key="${line%%=*}"
    local value="${line#*=}"
    key="$(echo "$key" | tr -d '[:space:]')"
    value="$(echo "$value" | sed "s/^['\"]//;s/['\"]$//")"

    case "$key" in
      SUPABASE_URL)
        [ -z "$SUPABASE_URL" ] && SUPABASE_URL="$value"
        ;;
      NEXT_PUBLIC_SUPABASE_URL)
        [ -z "$SUPABASE_URL" ] && SUPABASE_URL="$value"
        ;;
      SUPABASE_SERVICE_ROLE_KEY)
        [ -z "$SUPABASE_SERVICE_ROLE_KEY" ] && SUPABASE_SERVICE_ROLE_KEY="$value"
        ;;
      ANTHROPIC_API_KEY)
        [ -z "$ANTHROPIC_API_KEY" ] && ANTHROPIC_API_KEY="$value"
        ;;
    esac
  done < "$env_file"
}

load_env_file "$HOME/.claude/.env"
load_env_file "/Volumes/Lexar/Projects/Mainline Apps/dashboard/.env.local"

[ -n "$SUPABASE_URL" ] && export SUPABASE_URL
[ -n "$SUPABASE_SERVICE_ROLE_KEY" ] && export SUPABASE_SERVICE_ROLE_KEY
[ -n "$ANTHROPIC_API_KEY" ] && export ANTHROPIC_API_KEY

# Validate required env vars
if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (or present in ~/.claude/.env / dashboard .env.local)"
  exit 1
fi

if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "ERROR: ANTHROPIC_API_KEY must be set (or present in ~/.claude/.env)"
  exit 1
fi

log() {
  echo "[$(date +%H:%M:%S)] $1" | tee -a "$LOG_DIR/$DATE-work-loop.log"
}

# Fetch approved work items from Supabase
fetch_approved_items() {
  local raw
  raw=$(curl -s \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    "$SUPABASE_URL/rest/v1/work_items?status=eq.approved&assigned_to=is.null&order=created_at.asc&limit=100&select=id,title,description,project,priority,type,source_type,source_id,metadata")

  # Sort by priority then take MAX_ITEMS
  echo "$raw" | python3 -c "
import sys, json
priority_order = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3, None: 4}
items = json.load(sys.stdin)
if isinstance(items, list):
    items.sort(key=lambda x: (priority_order.get(x.get('priority'), 4), x.get('created_at', '')))
    json.dump(items[:$MAX_ITEMS], sys.stdout)
else:
    json.dump([], sys.stdout)
"
}

# Update a work item in Supabase
update_work_item() {
  local item_id="$1"
  local payload="$2"

  curl -s \
    -X PATCH \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -d "$payload" \
    "$SUPABASE_URL/rest/v1/work_items?id=eq.$item_id"
}

# Insert a work item event
insert_event() {
  local item_id="$1" event_type="$2" from_status="$3" to_status="$4" notes="$5"

  curl -s \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"work_item_id\":\"$item_id\",\"event_type\":\"$event_type\",\"from_status\":\"$from_status\",\"to_status\":\"$to_status\",\"actor\":\"work-loop-manager\",\"actor_type\":\"agent\",\"notes\":\"$notes\"}" \
    "$SUPABASE_URL/rest/v1/work_item_events" > /dev/null 2>&1 || true
}

# Build worker prompt from template
build_worker_prompt() {
  local item_json="$1"

  # Use Python for template substitution — safe with any characters in title/description
  # Pass JSON via stdin to avoid shell escaping issues
  echo "$item_json" | python3 << 'PYEOF'
import json, sys, os

item = json.load(sys.stdin)
prompt_path = os.environ.get('WORKER_PROMPT', 'agents/workers/implement-finding.md')
exec_mode = os.environ.get('EXECUTION_MODE', 'dry_run')

with open(prompt_path) as f:
    template = f.read()

replacements = {
    '{{WORK_ITEM_ID}}': item['id'],
    '{{WORK_ITEM_ID_SHORT}}': item['id'][:8],
    '{{TITLE}}': item.get('title', ''),
    '{{DESCRIPTION}}': item.get('description') or 'No description',
    '{{PROJECT}}': item.get('project', ''),
    '{{PRIORITY}}': item.get('priority') or 'medium',
    '{{TYPE}}': item.get('type', 'finding'),
    '{{SOURCE_TYPE}}': item.get('source_type') or 'agent',
    '{{SOURCE_ID}}': item.get('source_id') or 'N/A',
    '{{EXECUTION_MODE}}': exec_mode,
}

for key, value in replacements.items():
    template = template.replace(key, str(value))

print(template)
PYEOF
}

# Run a worker agent for a single work item
run_worker() {
  local item_json="$1"
  local item_id project project_dir

  item_id=$(echo "$item_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
  project=$(echo "$item_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['project'])")
  project_dir="$PROJECTS_DIR/$project"

  if [ ! -d "$project_dir" ]; then
    log "SKIP $item_id: project directory not found: $project_dir"
    return 1
  fi

  local short_id
  short_id=$(echo "$item_id" | cut -c1-8)
  log "WORKER START: $short_id ($project) — $(echo "$item_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['title'][:60])")"

  # Mark as in_progress + assigned to worker
  update_work_item "$item_id" "{\"status\":\"in_progress\",\"assigned_to\":\"worker-agent\",\"execution_mode\":\"$EXECUTION_MODE\",\"updated_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
  insert_event "$item_id" "assigned" "approved" "in_progress" "Assigned to worker agent ($EXECUTION_MODE mode)"

  # Build prompt
  local prompt
  prompt=$(build_worker_prompt "$item_json")

  # Run claude -p with timeout (10 minutes max per item)
  local output_file="$LOG_DIR/$DATE-worker-$short_id.log"
  local start_time end_time duration

  start_time=$(date +%s)

  cd "$project_dir"
  set -o pipefail
  if timeout 600 claude -p "$prompt" --max-turns 30 --allowedTools "Read,Write,Edit,Glob,Grep,Bash" 2>&1 | tee "$output_file"; then
    end_time=$(date +%s)
    duration=$((end_time - start_time))
    log "WORKER DONE: $short_id (${duration}s)"

    # Extract markers from output
    local proposed_diff execution_log branch_name already_resolved
    proposed_diff=$(sed -n '/===PROPOSED_DIFF_START===/,/===PROPOSED_DIFF_END===/p' "$output_file" | sed '1d;$d' || echo "")
    execution_log=$(sed -n '/===EXECUTION_LOG_START===/,/===EXECUTION_LOG_END===/p' "$output_file" | sed '1d;$d' || echo "")
    branch_name=$(sed -n '/===BRANCH_NAME_START===/,/===BRANCH_NAME_END===/p' "$output_file" | sed '1d;$d' || echo "")
    already_resolved=$(grep -c '===ALREADY_RESOLVED===' "$output_file" || echo "0")

    if [ "$already_resolved" -gt 0 ]; then
      # Finding already fixed in current code — auto-close
      local log_escaped
      log_escaped=$(python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))" <<< "${execution_log:-Worker determined finding is already resolved}")
      update_work_item "$item_id" "{\"status\":\"done\",\"execution_log\":$log_escaped,\"assigned_to\":\"worker-agent\",\"updated_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
      insert_event "$item_id" "auto_closed" "in_progress" "done" "Worker verified finding already resolved in current code"
      log "AUTO-CLOSED: $short_id — already resolved"
    elif [ -n "$proposed_diff" ]; then
      # Escape for JSON
      local diff_escaped log_escaped
      diff_escaped=$(python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))" <<< "$proposed_diff")
      log_escaped=$(python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))" <<< "$execution_log")

      # Update work item with diff and set to review
      update_work_item "$item_id" "{\"status\":\"review\",\"proposed_diff\":$diff_escaped,\"execution_log\":$log_escaped,\"branch_name\":$([ -n "$branch_name" ] && echo "\"$branch_name\"" || echo "null"),\"updated_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
      insert_event "$item_id" "worker_completed" "in_progress" "review" "Worker generated proposed changes"
      log "REVIEW: $short_id — diff generated, awaiting human review"
    else
      # Worker couldn't generate a diff — escalate
      local log_escaped
      log_escaped=$(python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))" <<< "${execution_log:-Worker produced no output markers}")
      update_work_item "$item_id" "{\"status\":\"review\",\"proposed_diff\":null,\"execution_log\":$log_escaped,\"updated_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
      insert_event "$item_id" "worker_failed" "in_progress" "review" "Worker could not generate fix — needs human review"
      log "ESCALATE: $short_id — no diff generated"
    fi
  else
    log "WORKER FAILED: $short_id (timeout or error)"
    update_work_item "$item_id" "{\"status\":\"review\",\"execution_log\":\"Worker timed out or crashed\",\"updated_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
    insert_event "$item_id" "worker_failed" "in_progress" "review" "Worker timed out or crashed"
  fi

  # Return to workspace root
  cd - > /dev/null

  # Log run to agent_runs_v2
  curl -s \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"agent_id\":\"worker\",\"project\":\"$project\",\"work_item_id\":\"$item_id\",\"trigger\":\"github_actions\",\"status\":\"completed\",\"completed_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" \
    "$SUPABASE_URL/rest/v1/agent_runs_v2" > /dev/null 2>&1 || true

  # Brief pause between workers
  sleep 2
}

# ===== MAIN =====

log "=== Work Loop Manager starting (max_items=$MAX_ITEMS, mode=$EXECUTION_MODE) ==="

# Fetch approved items
ITEMS=$(fetch_approved_items)
ITEM_COUNT=$(echo "$ITEMS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)

if [ "$ITEM_COUNT" -eq 0 ]; then
  log "No approved work items to process. Exiting."
  exit 0
fi

log "Found $ITEM_COUNT approved work item(s) to process"

# Write items to temp file (avoids subshell issues with piped while loops)
ITEMS_FILE=$(mktemp)
echo "$ITEMS" | python3 -c "
import sys, json
items = json.load(sys.stdin)
for item in items:
    print(json.dumps(item))
" > "$ITEMS_FILE"

# Process each item sequentially
while IFS= read -r item_json; do
  [ -z "$item_json" ] && continue
  run_worker "$item_json" || true
done < "$ITEMS_FILE"

rm -f "$ITEMS_FILE"

log "=== Work Loop Manager complete ==="
