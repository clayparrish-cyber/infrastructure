#!/bin/bash
# Work Loop Manager — Dispatches worker agents for approved work items
# Runs in GitHub Actions after nightly scout reviews + sync
# Usage: ./work-loop-manager.sh [--max-items N]
#
# Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
# Optional env vars: PROJECTS_DIR, WORKER_PROMPT, REGISTRY, LOG_DIR, EXECUTION_MODE, NIGHTLY_COST_CAP

set -euo pipefail

MAX_ITEMS="${MAX_WORKER_ITEMS:-5}"
EXECUTION_MODE="${EXECUTION_MODE:-dry_run}"
PROJECTS_DIR="${PROJECTS_DIR:-projects}"
WORKER_PROMPT="${WORKER_PROMPT:-agents/workers/implement-finding.md}"
REGISTRY="${REGISTRY:-agents/registry.json}"
LOG_DIR="${LOG_DIR:-logs}"
NIGHTLY_COST_CAP="${NIGHTLY_COST_CAP:-10.00}"
CUMULATIVE_COST="0"
DATE=$(date +%Y-%m-%d)
RUN_TRIGGER="work_loop_manager"
SCRIPT_ROOT="$(pwd)"

resolve_repo_relative_path() {
  local path_value="$1"

  PATH_VALUE="$path_value" SCRIPT_ROOT_VALUE="$SCRIPT_ROOT" python3 << 'PYEOF'
import os
from pathlib import Path

path_value = os.environ.get('PATH_VALUE', '').strip()
script_root = Path(os.environ.get('SCRIPT_ROOT_VALUE', '.')).resolve()

if not path_value:
    print(str(script_root))
    raise SystemExit(0)

path = Path(path_value)
if path.is_absolute():
    print(str(path))
else:
    print(str((script_root / path).resolve()))
PYEOF
}

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

LOG_DIR="$(resolve_repo_relative_path "$LOG_DIR")"
REGISTRY="$(resolve_repo_relative_path "$REGISTRY")"
WORKER_PROMPT="$(resolve_repo_relative_path "$WORKER_PROMPT")"

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

run_with_timeout() {
  local timeout_seconds="$1"
  shift

  if command -v timeout >/dev/null 2>&1; then
    timeout "$timeout_seconds" "$@"
    return $?
  fi

  if command -v gtimeout >/dev/null 2>&1; then
    gtimeout "$timeout_seconds" "$@"
    return $?
  fi

  python3 - "$timeout_seconds" "$@" << 'PYEOF'
import subprocess
import sys

timeout_seconds = int(sys.argv[1])
command = sys.argv[2:]

try:
    completed = subprocess.run(
        command,
        timeout=timeout_seconds,
        check=False,
        stdin=subprocess.DEVNULL,
    )
    raise SystemExit(completed.returncode)
except subprocess.TimeoutExpired:
    raise SystemExit(124)
PYEOF
}

resolve_project_dir() {
  local project_slug="$1"

  PROJECT_SLUG="$project_slug" REGISTRY_PATH="$REGISTRY" PROJECTS_ROOT="$PROJECTS_DIR" python3 << 'PYEOF'
import json, os
from pathlib import Path

project = os.environ.get('PROJECT_SLUG', '').strip()
registry_path = os.environ.get('REGISTRY_PATH', '').strip()
projects_root = os.environ.get('PROJECTS_ROOT', 'projects').strip() or 'projects'

fallback = str(Path(projects_root) / project)

if registry_path:
    path = Path(registry_path)
    if path.is_file():
        try:
            registry = json.loads(path.read_text())
            project_entry = ((registry or {}).get('projects') or {}).get(project) or {}
            resolved = project_entry.get('path')
            if isinstance(resolved, str) and resolved.strip():
                print(resolved.strip())
                raise SystemExit(0)
        except Exception:
            pass

print(fallback)
PYEOF
}

# Fetch approved work items from Supabase
fetch_autonomy_rules() {
  curl -s \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    "$SUPABASE_URL/rest/v1/autonomy_rules?select=decision_category,current_level,shadow_total,shadow_agreement_rate,metadata&limit=1000"
}

fetch_approved_items() {
  local raw
  local autonomy_rules
  raw=$(curl -s \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    "$SUPABASE_URL/rest/v1/work_items?status=eq.approved&assigned_to=is.null&system_recommendation=not.is.null&source_type=eq.agent&order=created_at.asc&limit=100&select=id,title,description,project,priority,type,source_type,source_id,decision_category,created_at,metadata")
  autonomy_rules=$(fetch_autonomy_rules)

# Sort by priority, then bias toward L2 categories that are closest to graduation.
  echo "$raw" | AUTONOMY_RULES_JSON="$autonomy_rules" python3 -c "
import sys, json

priority_order = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3, None: 4}

try:
    items = json.load(sys.stdin)
except Exception:
    items = []

try:
    rules = json.loads(__import__('os').environ.get('AUTONOMY_RULES_JSON') or '[]')
except Exception:
    rules = []

rules_by_category = {}
for rule in rules:
    if not isinstance(rule, dict):
        continue
    category = rule.get('decision_category')
    if isinstance(category, str) and category:
        rules_by_category[category] = rule

def safe_human_approvals(rule):
    metadata = rule.get('metadata') if isinstance(rule, dict) else {}
    if not isinstance(metadata, dict):
        return 0
    safety = metadata.get('safety_metrics')
    if not isinstance(safety, dict):
        return 0
    value = safety.get('safe_human_approvals')
    return int(value) if isinstance(value, (int, float)) else 0

def graduation_priority(item):
    category = item.get('decision_category')
    if not isinstance(category, str) or not category:
        return (1, 999, 999)

    rule = rules_by_category.get(category)
    if not isinstance(rule, dict):
        return (1, 999, 999)

    current_level = int(rule.get('current_level') or 1)
    shadow_total = int(rule.get('shadow_total') or 0)
    shadow_rate = float(rule.get('shadow_agreement_rate') or 0)
    if current_level != 2 or shadow_rate < 0.9:
        return (1, 999, 999)

    shadow_gap = max(0, 20 - shadow_total)
    safe_gap = max(0, 10 - safe_human_approvals(rule))
    return (0, shadow_gap + safe_gap, shadow_gap)

if isinstance(items, list):
    items.sort(key=lambda x: (
        priority_order.get(x.get('priority'), 4),
        graduation_priority(x),
        x.get('created_at', ''),
    ))
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

  # Use Python for template substitution — safe with any characters in title/description.
  ITEM_JSON="$item_json" python3 << 'PYEOF'
import json, sys, os

item = json.loads(os.environ.get('ITEM_JSON') or '{}')
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

build_worker_metadata_json() {
  local item_json="$1"
  local validation_json="${2:-}"

  ITEM_JSON="$item_json" VALIDATION_JSON="$validation_json" python3 << 'PYEOF'
import json, os
from datetime import datetime, timezone

def clean_str(value):
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value or None

def clean_check(value):
    if not isinstance(value, dict):
        return None
    status = value.get('status')
    if status not in {'passed', 'failed', 'skipped', 'not_applicable'}:
        return None
    return {
        'status': status,
        'command': clean_str(value.get('command')),
        'notes': clean_str(value.get('notes')),
    }

item = json.loads(os.environ.get('ITEM_JSON') or '{}')
metadata = item.get('metadata') if isinstance(item.get('metadata'), dict) else {}
raw_validation = (os.environ.get('VALIDATION_JSON') or '').strip()

validation = {}
if raw_validation:
    try:
        validation = json.loads(raw_validation)
    except Exception:
        validation = {}

if not isinstance(validation, dict):
    validation = {}

type_check = clean_check(validation.get('type_check'))
tests = validation.get('tests') if isinstance(validation.get('tests'), list) else []
clean_tests = [entry for entry in (clean_check(test) for test in tests) if entry]
manual_values = validation.get('manual_checks') if isinstance(validation.get('manual_checks'), list) else []
manual_checks = [
    step.strip() for step in manual_values
    if isinstance(step, str) and step.strip()
]

if type_check or clean_tests or manual_checks:
    metadata['worker_validation'] = {
        'captured_at': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
        'type_check': type_check,
        'tests': clean_tests,
        'manual_checks': manual_checks,
    }

    test_commands = [entry['command'] for entry in clean_tests if entry.get('command')]
    if test_commands:
        metadata['test_command'] = '\n'.join(test_commands[:3])

    if type_check and type_check.get('command'):
        metadata['verification_command'] = type_check['command']

    validation_steps = []
    if type_check:
        line = f"Type check ({type_check['status']}): {type_check.get('command') or 'no command recorded'}"
        if type_check.get('notes'):
            line += f" — {type_check['notes']}"
        validation_steps.append(line)

    for index, test in enumerate(clean_tests, start=1):
        line = f"Test {index} ({test['status']}): {test.get('command') or 'no command recorded'}"
        if test.get('notes'):
            line += f" — {test['notes']}"
        validation_steps.append(line)

    for step in manual_checks:
        validation_steps.append(f"Manual: {step}")

    if validation_steps:
        metadata['validation_steps'] = '\n'.join(f"- {line}" for line in validation_steps)

print(json.dumps(metadata, separators=(',', ':')))
PYEOF
}

# Run a worker agent for a single work item
run_worker() {
  local item_json="$1"
  local item_id project project_dir
  local worker_run_start worker_run_status

  item_id=$(echo "$item_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
  project=$(echo "$item_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['project'])")
  project_dir=$(resolve_project_dir "$project")

  if [ ! -d "$project_dir" ]; then
    log "SKIP $item_id: project directory not found: $project_dir"
    return 1
  fi

  local short_id
  short_id=$(echo "$item_id" | cut -c1-8)
  worker_run_start=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  worker_run_status="completed"
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

  # Initialize telemetry vars before the if/else so they exist in both branches
  local tokens_input=0 tokens_output=0 cost_usd=0

  cd "$project_dir"
  set -o pipefail
  local json_output="$LOG_DIR/$DATE-worker-$short_id-output.json"
  if run_with_timeout 600 claude -p "$prompt" --max-turns 30 --output-format json --permission-mode bypassPermissions --allowedTools "Read,Write,Edit,Glob,Grep,Bash" < /dev/null > "$json_output" 2>"$output_file.stderr"; then
    # Guard against empty output from claude -p
    if [ ! -s "$json_output" ]; then
      log "WORKER FAILED: $short_id (empty output from claude)"
      worker_run_status="failed"
      update_work_item "$item_id" "{\"status\":\"review\",\"execution_log\":\"Worker received empty response from claude -p\",\"updated_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
      insert_event "$item_id" "worker_failed" "in_progress" "review" "Worker received empty response from claude -p"
      cd - > /dev/null
      curl -s \
        -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
        -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
        -H "Content-Type: application/json" \
        -d "{\"agent_id\":\"worker\",\"project\":\"$project\",\"work_item_id\":\"$item_id\",\"trigger\":\"$RUN_TRIGGER\",\"status\":\"$worker_run_status\",\"started_at\":\"$worker_run_start\",\"completed_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"tokens_used\":0,\"cost_estimate\":0}" \
        "$SUPABASE_URL/rest/v1/agent_runs_v2" > /dev/null 2>&1 || true
      sleep 2
      return 1
    fi

    # Extract text content from JSON for marker parsing
    python3 -c "
import json, sys
with open(sys.argv[1]) as f:
    data = json.load(f)
result = data.get('result', '')
if isinstance(result, list):
    result = '\n'.join(str(r.get('text', '')) if isinstance(r, dict) else str(r) for r in result)
print(result)
" "$json_output" > "$output_file" 2>/dev/null || cp "$json_output" "$output_file"

    end_time=$(date +%s)
    duration=$((end_time - start_time))
    log "WORKER DONE: $short_id (${duration}s)"

    # Extract usage telemetry (vars initialized before if/else)
    if [ -f "$json_output" ]; then
      eval "$(python3 -c "
import json
with open('$json_output') as f:
    data = json.load(f)
usage = data.get('usage', {})
ti = usage.get('input_tokens', 0) + usage.get('cache_creation_input_tokens', 0) + usage.get('cache_read_input_tokens', 0)
to = usage.get('output_tokens', 0)
cost = data.get('total_cost_usd', 0) or data.get('cost_usd', 0) or 0
print(f'tokens_input={ti} tokens_output={to} cost_usd={cost}')
" 2>/dev/null)" || true
      log "USAGE: $short_id — ${tokens_input}+${tokens_output} tokens, \$${cost_usd}"
      # Write cost to shared file for governor
      echo "$cost_usd" > "$COST_FILE" 2>/dev/null || true
    fi

    # Extract markers from output
    local proposed_diff execution_log branch_name already_resolved validation_json metadata_json
    proposed_diff=$(sed -n '/===PROPOSED_DIFF_START===/,/===PROPOSED_DIFF_END===/p' "$output_file" | sed '1d;$d' || echo "")
    execution_log=$(sed -n '/===EXECUTION_LOG_START===/,/===EXECUTION_LOG_END===/p' "$output_file" | sed '1d;$d' || echo "")
    branch_name=$(sed -n '/===BRANCH_NAME_START===/,/===BRANCH_NAME_END===/p' "$output_file" | sed '1d;$d' || echo "")
    validation_json=$(sed -n '/===VALIDATION_JSON_START===/,/===VALIDATION_JSON_END===/p' "$output_file" | sed '1d;$d' || echo "")
    metadata_json=$(build_worker_metadata_json "$item_json" "$validation_json")
    already_resolved=$(grep -c '===ALREADY_RESOLVED===' "$output_file" || echo "0")
    human_action=$(grep -c '===HUMAN_ACTION_REQUIRED===' "$output_file" || echo "0")

    if [ "$already_resolved" -gt 0 ]; then
      # Finding already fixed in current code — auto-close
      local log_escaped
      log_escaped=$(python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))" <<< "${execution_log:-Worker determined finding is already resolved}")
      update_work_item "$item_id" "{\"status\":\"done\",\"execution_log\":$log_escaped,\"assigned_to\":\"worker-agent\",\"metadata\":$metadata_json,\"updated_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
      insert_event "$item_id" "auto_closed" "in_progress" "done" "Worker verified finding already resolved in current code"
      log "AUTO-CLOSED: $short_id — already resolved"
    elif [ "$human_action" -gt 0 ]; then
      # Route back to triaged for human pickup
      local log_escaped
      log_escaped=$(python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))" <<< "${execution_log:-Worker determined this requires human action}")
      update_work_item "$item_id" "{\"status\":\"triaged\",\"assigned_to\":null,\"execution_log\":$log_escaped,\"metadata\":$metadata_json,\"updated_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
      insert_event "$item_id" "human_required" "in_progress" "triaged" "Worker determined this item requires human action — routing to triage"
      log "HUMAN-ACTION: $short_id — routed to triage"
    elif [ -n "$proposed_diff" ]; then
      # Escape for JSON
      local diff_escaped log_escaped
      diff_escaped=$(python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))" <<< "$proposed_diff")
      log_escaped=$(python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))" <<< "$execution_log")

      # Update work item with diff and set to review
      update_work_item "$item_id" "{\"status\":\"review\",\"proposed_diff\":$diff_escaped,\"execution_log\":$log_escaped,\"branch_name\":$([ -n "$branch_name" ] && echo "\"$branch_name\"" || echo "null"),\"metadata\":$metadata_json,\"updated_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
      insert_event "$item_id" "worker_completed" "in_progress" "review" "Worker generated proposed changes"
      log "REVIEW: $short_id — diff generated, awaiting human review"
    else
      # Worker couldn't generate a diff — escalate
      local log_escaped
      log_escaped=$(python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))" <<< "${execution_log:-Worker produced no output markers}")
      update_work_item "$item_id" "{\"status\":\"review\",\"proposed_diff\":null,\"execution_log\":$log_escaped,\"metadata\":$metadata_json,\"updated_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
      insert_event "$item_id" "worker_failed" "in_progress" "review" "Worker could not generate fix — needs human review"
      log "ESCALATE: $short_id — no diff generated"
    fi
  else
    log "WORKER FAILED: $short_id (timeout or error)"
    worker_run_status="failed"
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
    -d "{\"agent_id\":\"worker\",\"project\":\"$project\",\"work_item_id\":\"$item_id\",\"trigger\":\"$RUN_TRIGGER\",\"status\":\"$worker_run_status\",\"started_at\":\"$worker_run_start\",\"completed_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"tokens_used\":$((tokens_input + tokens_output)),\"cost_estimate\":$cost_usd}" \
    "$SUPABASE_URL/rest/v1/agent_runs_v2" > /dev/null 2>&1 || true

  # Brief pause between workers
  sleep 2
}

# ── Specialist Delegation Support ──

# Specialist ID to prompt file mapping
specialist_prompt_path() {
  local specialist_id="$1"
  case "$specialist_id" in
    legal-advisor)        echo "agents/specialists/legal-review.md" ;;
    marketing-analyst)    echo "agents/specialists/marketing-analysis.md" ;;
    competitive-intel)    echo "agents/specialists/competitive-intel-analysis.md" ;;
    business-analyst)     echo "agents/specialists/business-analysis.md" ;;
    *)                    echo "" ;;
  esac
}

# Fetch approved delegation work items from Supabase
fetch_delegation_items() {
  local raw
  raw=$(curl -s \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    "$SUPABASE_URL/rest/v1/work_items?status=eq.approved&assigned_to=not.is.null&order=created_at.asc&limit=5&select=id,title,description,project,priority,type,source_type,source_id,assigned_to,metadata,decision_category")

  echo "$raw" | python3 -c "
import json, sys

try:
    data = json.load(sys.stdin)
except Exception:
    json.dump([], sys.stdout)
    sys.exit(0)

if not isinstance(data, list):
    json.dump([], sys.stdout)
    sys.exit(0)

filtered = []
for item in data:
    if not isinstance(item, dict):
        continue
    decision_category = item.get('decision_category') or ''
    metadata = item.get('metadata') or {}
    if decision_category.startswith('delegation-') or metadata.get('requesting_agent') or metadata.get('specialist'):
        filtered.append(item)

json.dump(filtered, sys.stdout)
"
}

# Build specialist prompt from templates
build_specialist_prompt() {
  local item_json="$1"

  ITEM_JSON="$item_json" python3 << 'PYEOF'
import json, sys, os

item = json.loads(os.environ.get('ITEM_JSON') or '{}')

specialist_id = item.get('assigned_to', '')
metadata = item.get('metadata', {}) or {}
requesting_agent = metadata.get('requesting_agent', 'unknown')
parent_id = metadata.get('parent_id', '')

# Map specialist ID to prompt file
specialist_map = {
    'legal-advisor': 'agents/specialists/legal-review.md',
    'marketing-analyst': 'agents/specialists/marketing-analysis.md',
    'competitive-intel': 'agents/specialists/competitive-intel-analysis.md',
    'business-analyst': 'agents/specialists/business-analysis.md',
}

specialist_prompt_path = specialist_map.get(specialist_id, '')
dispatch_template_path = 'agents/workers/run-specialist.md'

# Read templates
try:
    with open(dispatch_template_path) as f:
        dispatch_template = f.read()
except FileNotFoundError:
    print(f"ERROR: Dispatch template not found: {dispatch_template_path}", file=sys.stderr)
    sys.exit(1)

specialist_prompt = ''
if specialist_prompt_path:
    try:
        with open(specialist_prompt_path) as f:
            specialist_prompt = f.read()
    except FileNotFoundError:
        print(f"WARNING: Specialist prompt not found: {specialist_prompt_path}", file=sys.stderr)

replacements = {
    '{{WORK_ITEM_ID}}': item['id'],
    '{{TITLE}}': item.get('title', ''),
    '{{DESCRIPTION}}': item.get('description') or 'No description',
    '{{PROJECT}}': item.get('project', ''),
    '{{REQUESTING_AGENT}}': requesting_agent,
    '{{PARENT_ID}}': parent_id,
    '{{SPECIALIST_ID}}': specialist_id,
    '{{SPECIALIST_PROMPT_PATH}}': specialist_prompt_path,
}

for key, value in replacements.items():
    dispatch_template = dispatch_template.replace(key, str(value))
    specialist_prompt = specialist_prompt.replace(key, str(value))

# Combine: dispatch template + specialist prompt
combined = dispatch_template + '\n\n---\n\n' + specialist_prompt
print(combined)
PYEOF
}

# Run a specialist agent for a delegation work item
run_specialist() {
  local item_json="$1"
  local item_id project specialist project_dir
  local specialist_run_start specialist_run_status

  item_id=$(echo "$item_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
  project=$(echo "$item_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['project'])")
  specialist=$(echo "$item_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('assigned_to','unknown'))")
  project_dir=$(resolve_project_dir "$project")

  if [ ! -d "$project_dir" ]; then
    log "SKIP DELEGATION $item_id: project directory not found: $project_dir"
    return 1
  fi

  # Verify specialist prompt exists
  local prompt_file
  prompt_file=$(specialist_prompt_path "$specialist")
  if [ -z "$prompt_file" ] || [ ! -f "$prompt_file" ]; then
    log "SKIP DELEGATION $item_id: unknown specialist '$specialist'"
    update_work_item "$item_id" "{\"status\":\"review\",\"execution_log\":\"Unknown specialist: $specialist\",\"updated_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
    insert_event "$item_id" "worker_failed" "in_progress" "review" "Unknown specialist type: $specialist"
    return 1
  fi

  local short_id
  short_id=$(echo "$item_id" | cut -c1-8)
  specialist_run_start=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  specialist_run_status="completed"
  log "SPECIALIST START: $short_id ($project) — $specialist — $(echo "$item_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['title'][:60])")"

  # Mark as in_progress
  update_work_item "$item_id" "{\"status\":\"in_progress\",\"execution_mode\":\"specialist\",\"updated_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
  insert_event "$item_id" "assigned" "approved" "in_progress" "Dispatched to specialist: $specialist"

  # Build combined prompt
  local prompt
  prompt=$(build_specialist_prompt "$item_json")

  # Run claude -p with timeout (10 minutes max per specialist)
  local output_file="$LOG_DIR/$DATE-specialist-$short_id.log"
  local start_time end_time duration

  start_time=$(date +%s)

  # Initialize telemetry vars before the if/else so they exist in both branches
  local tokens_input=0 tokens_output=0 cost_usd=0

  cd "$project_dir"
  set -o pipefail
  local json_output="$LOG_DIR/$DATE-specialist-$short_id-output.json"
  if run_with_timeout 600 claude -p "$prompt" --max-turns 20 --output-format json --permission-mode bypassPermissions --allowedTools "Read,Glob,Grep" < /dev/null > "$json_output" 2>"$output_file.stderr"; then
    # Extract text content from JSON for marker parsing
    python3 -c "
import json, sys
with open(sys.argv[1]) as f:
    data = json.load(f)
result = data.get('result', '')
if isinstance(result, list):
    result = '\n'.join(str(r.get('text', '')) if isinstance(r, dict) else str(r) for r in result)
print(result)
" "$json_output" > "$output_file" 2>/dev/null || cp "$json_output" "$output_file"

    end_time=$(date +%s)
    duration=$((end_time - start_time))
    log "SPECIALIST DONE: $short_id (${duration}s)"

    # Extract usage telemetry (vars initialized before if/else)
    if [ -f "$json_output" ]; then
      eval "$(python3 -c "
import json
with open('$json_output') as f:
    data = json.load(f)
usage = data.get('usage', {})
ti = usage.get('input_tokens', 0) + usage.get('cache_creation_input_tokens', 0) + usage.get('cache_read_input_tokens', 0)
to = usage.get('output_tokens', 0)
cost = data.get('total_cost_usd', 0) or data.get('cost_usd', 0) or 0
print(f'tokens_input={ti} tokens_output={to} cost_usd={cost}')
" 2>/dev/null)" || true
      log "USAGE: $short_id — ${tokens_input}+${tokens_output} tokens, \$${cost_usd}"
      echo "$cost_usd" > "$COST_FILE" 2>/dev/null || true
    fi

    # Extract markers from output
    local analysis execution_log work_items_json
    analysis=$(sed -n '/===ANALYSIS_START===/,/===ANALYSIS_END===/p' "$output_file" | sed '1d;$d' || echo "")
    execution_log=$(sed -n '/===EXECUTION_LOG_START===/,/===EXECUTION_LOG_END===/p' "$output_file" | sed '1d;$d' || echo "")
    work_items_json=$(sed -n '/===WORK_ITEMS_START===/,/===WORK_ITEMS_END===/p' "$output_file" | sed '1d;$d' || echo "[]")

    # Combine analysis + execution_log for storage
    local combined_log="${analysis}"
    if [ -n "$execution_log" ]; then
      combined_log="${combined_log}

--- Execution Log ---
${execution_log}"
    fi

    # Escape for JSON
    local log_escaped
    log_escaped=$(python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))" <<< "$combined_log")

    # Update delegation item to done with analysis
    update_work_item "$item_id" "{\"status\":\"done\",\"execution_log\":$log_escaped,\"updated_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
    insert_event "$item_id" "specialist_completed" "in_progress" "done" "Specialist $specialist completed analysis"
    log "SPECIALIST COMPLETE: $short_id — analysis stored"

    # Create child work items if any
    if [ -n "$work_items_json" ] && [ "$work_items_json" != "[]" ]; then
      echo "$work_items_json" | python3 -c "
import json, sys, os
import urllib.request

items = json.load(sys.stdin)
if not isinstance(items, list):
    sys.exit(0)

url = os.environ['SUPABASE_URL'] + '/rest/v1/work_items'
key = os.environ['SUPABASE_SERVICE_ROLE_KEY']
project = '$project'
parent_id = '$item_id'
specialist = '$specialist'

for item in items[:3]:  # Max 3 child items
    payload = {
        'type': item.get('type', 'task'),
        'project': project,
        'title': item.get('title', 'Untitled'),
        'description': item.get('description', ''),
        'status': 'discovered',
        'priority': item.get('priority', 'medium'),
        'source_type': 'agent',
        'source_id': f'specialist-{specialist}',
        'created_by': f'specialist-{specialist}',
        'parent_id': parent_id,
        'decision_category': f'specialist-followup',
    }
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers={
        'apikey': key,
        'Authorization': f'Bearer {key}',
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
    })
    try:
        urllib.request.urlopen(req)
        print(f'      Created child item: {item.get(\"title\", \"Untitled\")}')
    except Exception as e:
        print(f'      Failed to create child item: {e}', file=sys.stderr)
" 2>&1 | while IFS= read -r line; do log "$line"; done || true
    fi

  else
    log "SPECIALIST FAILED: $short_id (timeout or error)"
    specialist_run_status="failed"
    update_work_item "$item_id" "{\"status\":\"review\",\"execution_log\":\"Specialist timed out or crashed\",\"updated_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
    insert_event "$item_id" "worker_failed" "in_progress" "review" "Specialist $specialist timed out or crashed"
  fi

  # Return to workspace root
  cd - > /dev/null

  # Log run to agent_runs_v2
  curl -s \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"agent_id\":\"$specialist\",\"project\":\"$project\",\"work_item_id\":\"$item_id\",\"trigger\":\"$RUN_TRIGGER\",\"status\":\"$specialist_run_status\",\"started_at\":\"$specialist_run_start\",\"completed_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"tokens_used\":$((tokens_input + tokens_output)),\"cost_estimate\":$cost_usd}" \
    "$SUPABASE_URL/rest/v1/agent_runs_v2" > /dev/null 2>&1 || true

  # Brief pause between specialists
  sleep 2
}

# ===== MAIN =====

log "=== Work Loop Manager starting (max_items=$MAX_ITEMS, mode=$EXECUTION_MODE) ==="

# Log manager run start to agent_runs_v2
MANAGER_RUN_START=$(date -u +%Y-%m-%dT%H:%M:%SZ)
curl -s \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"agent_id\":\"work-loop-manager\",\"project\":\"all\",\"trigger\":\"$RUN_TRIGGER\",\"status\":\"running\",\"started_at\":\"$MANAGER_RUN_START\"}" \
  "$SUPABASE_URL/rest/v1/agent_runs_v2" > /dev/null 2>&1 || true

# Fetch approved items
ITEMS=$(fetch_approved_items)
ITEM_COUNT=$(echo "$ITEMS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)

COST_FILE=$(mktemp)
echo "0" > "$COST_FILE"

# ── Phase 1: Process approved code-fix work items ──

if [ "$ITEM_COUNT" -eq 0 ]; then
  log "Phase 1: No approved work items to process"
else
  log "Phase 1: Found $ITEM_COUNT approved work item(s) to process"

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

    # Accumulate cost from last worker run
    LAST_COST=$(cat "$COST_FILE" 2>/dev/null || echo "0")
    CUMULATIVE_COST=$(python3 -c "print(round($CUMULATIVE_COST + ${LAST_COST:-0}, 4))" 2>/dev/null || echo "$CUMULATIVE_COST")
    echo "0" > "$COST_FILE"

    # Check cost cap
    if python3 -c "import sys; sys.exit(0 if $CUMULATIVE_COST >= $NIGHTLY_COST_CAP else 1)" 2>/dev/null; then
      log "COST CAP: Cumulative cost \$$CUMULATIVE_COST exceeds nightly cap \$$NIGHTLY_COST_CAP — stopping"
      break
    fi
  done < "$ITEMS_FILE"

  rm -f "$ITEMS_FILE"
fi

log "Phase 1 complete. Cumulative cost: \$$CUMULATIVE_COST"

# ── Phase 2: Process specialist delegation requests ──

# Check cost cap before starting Phase 2
SKIP_PHASE2=false
if python3 -c "import sys; sys.exit(0 if $CUMULATIVE_COST >= $NIGHTLY_COST_CAP else 1)" 2>/dev/null; then
  log "Phase 2 SKIPPED: cost cap already reached (\$$CUMULATIVE_COST >= \$$NIGHTLY_COST_CAP)"
  SKIP_PHASE2=true
fi

if [ "$SKIP_PHASE2" = "false" ]; then
  DELEGATIONS=$(fetch_delegation_items)
  DELEGATION_COUNT=$(echo "$DELEGATIONS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)

  if [ "$DELEGATION_COUNT" -gt 0 ]; then
    log "Phase 2: Processing $DELEGATION_COUNT delegation request(s)"

    # Write delegation items to temp file
    DELEGATION_FILE=$(mktemp)
    echo "$DELEGATIONS" | python3 -c "
import sys, json
items = json.load(sys.stdin)
for item in items:
    print(json.dumps(item))
" > "$DELEGATION_FILE"

    while IFS= read -r delegation_json; do
      [ -z "$delegation_json" ] && continue
      run_specialist "$delegation_json" || true

      # Accumulate cost from last specialist run
      LAST_COST=$(cat "$COST_FILE" 2>/dev/null || echo "0")
      CUMULATIVE_COST=$(python3 -c "print(round($CUMULATIVE_COST + ${LAST_COST:-0}, 4))" 2>/dev/null || echo "$CUMULATIVE_COST")
      echo "0" > "$COST_FILE"

      # Check cost cap
      if python3 -c "import sys; sys.exit(0 if $CUMULATIVE_COST >= $NIGHTLY_COST_CAP else 1)" 2>/dev/null; then
        log "COST CAP: Cumulative cost \$$CUMULATIVE_COST exceeds nightly cap \$$NIGHTLY_COST_CAP — stopping delegations"
        break
      fi
    done < "$DELEGATION_FILE"

    rm -f "$DELEGATION_FILE"
  else
    log "Phase 2: No delegation requests to process"
  fi
fi

rm -f "$COST_FILE"

log "Cumulative total cost: \$$CUMULATIVE_COST (cap: \$$NIGHTLY_COST_CAP)"

# Log manager run completion
curl -s -X PATCH \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d "{\"status\":\"completed\",\"completed_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"findings_count\":$ITEM_COUNT}" \
  "$SUPABASE_URL/rest/v1/agent_runs_v2?agent_id=eq.work-loop-manager&trigger=eq.$RUN_TRIGGER&started_at=eq.$MANAGER_RUN_START" || true

log "=== Work Loop Manager complete ==="
