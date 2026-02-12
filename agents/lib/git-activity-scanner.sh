#!/bin/bash
# Git Activity Scanner
# Outputs JSON: { "project_id": { "commits_7d": N, "last_commit": "YYYY-MM-DD", "active_days": N } }
# Usage: bash git-activity-scanner.sh
#
# Reads project paths from registry.json (same as nightly runner).

set -euo pipefail

# In CI, PROJECTS_DIR points to cloned project directories
# Locally, falls back to reading paths from registry.json
PROJECTS_DIR="${PROJECTS_DIR:-}"
REGISTRY="${REGISTRY:-$HOME/.claude/agents/registry.json}"
SEVEN_DAYS_AGO=$(date -v-7d +%Y-%m-%d 2>/dev/null || date -d "7 days ago" +%Y-%m-%d)

# Function to scan a single project and output its JSON entry
scan_project() {
  local project_id="$1"
  local project_path="$2"

  if [ ! -d "$project_path/.git" ]; then
    return 1
  fi

  # Count commits in last 7 days
  local commits_7d
  commits_7d=$(git -C "$project_path" log --oneline --since="$SEVEN_DAYS_AGO" 2>/dev/null | wc -l | tr -d ' ')

  # Get last commit date
  local last_commit
  last_commit=$(git -C "$project_path" log -1 --format=%cd --date=short 2>/dev/null || echo "never")

  # Count distinct active days in last 7 days
  local active_days
  active_days=$(git -C "$project_path" log --format=%cd --date=short --since="$SEVEN_DAYS_AGO" 2>/dev/null | sort -u | wc -l | tr -d ' ')

  # Days since last commit
  local days_since_commit
  if [ "$last_commit" != "never" ]; then
    if command -v gdate &>/dev/null; then
      local last_epoch now_epoch
      last_epoch=$(gdate -d "$last_commit" +%s)
      now_epoch=$(gdate +%s)
    else
      local last_epoch now_epoch
      last_epoch=$(date -j -f "%Y-%m-%d" "$last_commit" +%s 2>/dev/null || date -d "$last_commit" +%s)
      now_epoch=$(date +%s)
    fi
    days_since_commit=$(( (now_epoch - last_epoch) / 86400 ))
  else
    days_since_commit=999
  fi

  echo "  \"$project_id\": {"
  echo "    \"commits_7d\": $commits_7d,"
  echo "    \"active_days\": $active_days,"
  echo "    \"last_commit\": \"$last_commit\","
  echo "    \"days_since_commit\": $days_since_commit"
  echo "  }"
  return 0
}

echo "{"

FIRST=true

if [ -n "$PROJECTS_DIR" ]; then
  # CI mode: scan all directories in PROJECTS_DIR
  for project_dir in "$PROJECTS_DIR"/*/; do
    [ -d "$project_dir" ] || continue
    PROJECT_ID=$(basename "$project_dir")

    OUTPUT=$(scan_project "$PROJECT_ID" "$project_dir") || continue

    if [ "$FIRST" = true ]; then
      FIRST=false
    else
      echo ","
    fi
    echo "$OUTPUT"
  done
else
  # Local mode: read from registry
  while IFS='|' read -r project_id project_path; do
    OUTPUT=$(scan_project "$project_id" "$project_path") || continue

    if [ "$FIRST" = true ]; then
      FIRST=false
    else
      echo ","
    fi
    echo "$OUTPUT"

  done < <(python3 -c "
import json, os
with open('$REGISTRY') as f:
    reg = json.load(f)
for pid in reg['projects']:
    p = reg['projects'][pid]
    path = p['path'].replace('~', os.environ['HOME'])
    print(f'{pid}|{path}')
")
fi

echo ""
echo "}"
