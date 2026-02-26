# Auto-Execution Layer — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Activate the existing worker pipeline so that L3+ auto-approved findings are automatically executed by Claude Code, producing diffs for human review — closing the loop from discovery → approval → execution → review.

**Architecture:** The infrastructure already has 95% of what's needed. Job 6 (`workers`) in `nightly-review.yml` already calls `work-loop-manager.sh` which queries approved items, dispatches `claude -p` per item, and updates Supabase with results. The only blockers are: (1) `EXECUTION_MODE` is hardcoded to `dry_run`, (2) the `HUMAN_ACTION_REQUIRED` marker isn't handled in the bash script, (3) there's no filtering to distinguish auto-approved vs human-approved items for safety, and (4) the dashboard's code review UI needs a one-click "apply diff" flow. This plan makes surgical changes to flip the switch.

**Tech Stack:** Bash (work-loop-manager.sh), TypeScript (sync-to-supabase.ts), GitHub Actions YAML, Next.js (dashboard review UI)

---

## Overview: What Already Works vs What's Missing

### Already Working
- `sync-to-supabase.ts` → `applyRecommendation()` generates `system_recommendation` + `system_confidence` for L2+ categories
- `sync-to-supabase.ts` → `maybeAutoApprove()` auto-sets `status: 'approved'` for L3+ categories
- `work-loop-manager.sh` → queries approved items, builds prompts, runs `claude -p`, parses output markers, updates Supabase
- `implement-finding.md` → prompt template with dry_run/live modes, ALREADY_RESOLVED detection, HUMAN_ACTION_REQUIRED marker
- Job 6 in workflow YAML → wired up, installs claude-code, downloads project artifacts, runs the manager
- Dashboard → `UnifiedActionQueue` already renders `code_review` items with diff viewer and accept/rework buttons

### Missing (This Plan)
1. **Task 1:** Switch `EXECUTION_MODE` from `dry_run` to `live` in the workflow YAML
2. **Task 2:** Handle `HUMAN_ACTION_REQUIRED` marker in `work-loop-manager.sh` (currently ignored)
3. **Task 3:** Add `source_filter` to only execute auto-approved items (safety gate)
4. **Task 4:** Add execution telemetry — log cost/tokens per worker run
5. **Task 5:** Dashboard: show execution status on work items (in_progress spinner, diff review, execution log)
6. **Task 6:** Smoke test the full pipeline with a real auto-approved item

---

### Task 1: Switch Workers to Live Mode

**Files:**
- Modify: `/Volumes/Lexar/Projects/infrastructure/.github/workflows/nightly-review.yml:900`

**Context for engineer:**
Line 900 of the workflow YAML sets `EXECUTION_MODE: 'dry_run'`. In dry_run mode, the worker makes changes, captures the diff, then reverts everything (`git checkout .`). In live mode, it creates a branch (`worker/<short-id>`), commits, and reports the branch name back. Both modes update Supabase with the proposed diff. The key difference: live mode leaves a persistent branch on the ephemeral runner (which gets destroyed anyway since it's GitHub Actions). The diff is still captured and stored in Supabase regardless. So "live" vs "dry_run" is actually a minor distinction in CI — the branch is lost when the runner dies. But live mode tests the commit flow and gives us the branch name for future PR creation.

**Decision:** Switch to `dry_run` with one change — don't revert the diff capture. Actually, re-reading the prompt template: dry_run already captures the full diff before reverting. The diff gets stored in `proposed_diff` on the work item. That's all we need right now. The real switch is just making `EXECUTION_MODE` = `live` so we get the commit validation (linter + tests run after commit).

**Step 1: Change execution mode to live**

In `nightly-review.yml`, change line 900:

```yaml
# Before:
EXECUTION_MODE: 'dry_run'

# After:
EXECUTION_MODE: 'live'
```

**Step 2: Verify the change is isolated**

Run: `grep -n 'EXECUTION_MODE' /Volumes/Lexar/Projects/infrastructure/.github/workflows/nightly-review.yml`

Expected: Only line ~900 should reference this variable.

**Step 3: Commit**

```bash
cd /Volumes/Lexar/Projects/infrastructure
git add .github/workflows/nightly-review.yml
git commit -m "feat: switch worker execution mode from dry_run to live"
```

---

### Task 2: Handle HUMAN_ACTION_REQUIRED in Work Loop Manager

**Files:**
- Modify: `/Volumes/Lexar/Projects/infrastructure/agents/workers/work-loop-manager.sh:223-258`

**Context for engineer:**
The `implement-finding.md` prompt template tells the worker agent to emit `===HUMAN_ACTION_REQUIRED===` when a work item can't be fixed in code (e.g., "set up bank account", "verify app store submission"). But `work-loop-manager.sh` only checks for `ALREADY_RESOLVED` and `PROPOSED_DIFF` — it doesn't handle `HUMAN_ACTION_REQUIRED`. Currently these items would fall through to the "no diff generated" branch and get set to `review` status with a confusing message. They should instead be routed back to `triaged` status so Clay sees them as human tasks, not code review items.

**Step 1: Add HUMAN_ACTION_REQUIRED detection**

After the `already_resolved` check (around line 229) and before the `proposed_diff` check (around line 236), add:

```bash
    human_action=$(grep -c '===HUMAN_ACTION_REQUIRED===' "$output_file" || echo "0")

    if [ "$human_action" -gt 0 ]; then
      # Route back to triaged for human pickup
      local log_escaped
      log_escaped=$(python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))" <<< "${execution_log:-Worker determined this requires human action}")
      update_work_item "$item_id" "{\"status\":\"triaged\",\"assigned_to\":null,\"execution_log\":$log_escaped,\"updated_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
      insert_event "$item_id" "human_required" "in_progress" "triaged" "Worker determined this item requires human action — routing to triage"
      log "HUMAN-ACTION: $short_id — routed to triage"
```

This goes between the `ALREADY_RESOLVED` block and the `proposed_diff` block.

**Step 2: Run shellcheck on the modified script**

Run: `shellcheck /Volumes/Lexar/Projects/infrastructure/agents/workers/work-loop-manager.sh`

Expected: No new errors (existing ones are fine).

**Step 3: Commit**

```bash
cd /Volumes/Lexar/Projects/infrastructure
git add agents/workers/work-loop-manager.sh
git commit -m "feat: handle HUMAN_ACTION_REQUIRED marker in work loop manager"
```

---

### Task 3: Add Auto-Approved Safety Filter

**Files:**
- Modify: `/Volumes/Lexar/Projects/infrastructure/agents/workers/work-loop-manager.sh:100-118`

**Context for engineer:**
Currently `fetch_approved_items()` queries ALL approved items with `assigned_to=is.null`. This means items that Clay manually approved AND items that were auto-approved by L3+ autonomy rules are both eligible. For the initial rollout, we want workers to ONLY execute auto-approved items. This is a safety gate — Clay's manually-approved items might be complex tasks he wants to work on himself. Auto-approved items are the ones where the system decided they're safe to auto-execute.

We can distinguish them by checking `work_item_events` for an `auto_approved` event type, which `maybeAutoApprove()` in sync-to-supabase.ts inserts. But that requires a join. Simpler approach: add an `auto_approved` boolean column, or filter by checking if the item has a `system_recommendation` field set (which only L2+ items get). Actually simplest: check `source_type=eq.agent` (all auto-approved items are agent findings) AND add a query param to only get items where `system_recommendation` is not null.

**Better approach:** The Supabase REST API doesn't easily support "items that have an event of type auto_approved." Instead, we should add a lightweight flag. The simplest approach: when `maybeAutoApprove()` fires, it should also set a field we can filter on. We can use `metadata` to store `auto_approved: true`, or we can just rely on the fact that worker items with `source_type = 'agent'` and `system_recommendation = 'approved'` are auto-approved.

**Chosen approach:** Filter `fetch_approved_items()` to only return items where `system_recommendation` is not null. This ensures only items that went through the L2+ recommendation pipeline are eligible for auto-execution. Items Clay manually approved without a system recommendation won't be touched.

**Step 1: Update the fetch query in work-loop-manager.sh**

Change the curl URL in `fetch_approved_items()` (line ~105) from:

```
"$SUPABASE_URL/rest/v1/work_items?status=eq.approved&assigned_to=is.null&order=created_at.asc&limit=100&select=id,title,description,project,priority,type,source_type,source_id,metadata"
```

To:

```
"$SUPABASE_URL/rest/v1/work_items?status=eq.approved&assigned_to=is.null&system_recommendation=not.is.null&source_type=eq.agent&order=created_at.asc&limit=100&select=id,title,description,project,priority,type,source_type,source_id,metadata"
```

This adds two filters:
- `system_recommendation=not.is.null` — only items that went through shadow recommender
- `source_type=eq.agent` — only agent-generated findings (not human-created tasks)

**Step 2: Also update the check-items step in the YAML**

In `nightly-review.yml` around line 874, the `check-items` step also queries for approved items. Update its URL to match:

```bash
ITEM_COUNT=$(curl -s \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$SUPABASE_URL/rest/v1/work_items?status=eq.approved&assigned_to=is.null&system_recommendation=not.is.null&source_type=eq.agent&select=id&limit=1" \
  | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
```

**Step 3: Verify both queries match**

Run: `grep -n 'status=eq.approved' /Volumes/Lexar/Projects/infrastructure/.github/workflows/nightly-review.yml /Volumes/Lexar/Projects/infrastructure/agents/workers/work-loop-manager.sh`

Expected: Both queries should now include `system_recommendation=not.is.null&source_type=eq.agent`.

**Step 4: Commit**

```bash
cd /Volumes/Lexar/Projects/infrastructure
git add agents/workers/work-loop-manager.sh .github/workflows/nightly-review.yml
git commit -m "feat: filter worker queue to only auto-approved agent findings"
```

---

### Task 4: Add Worker Execution Telemetry

**Files:**
- Modify: `/Volumes/Lexar/Projects/infrastructure/agents/workers/work-loop-manager.sh:209-270`

**Context for engineer:**
The review agents already capture cost/token data via `--output-format json` and the `extract-usage.py` script. But the worker agents use `claude -p` with stdout piped through `tee` (not `--output-format json`), so we lose the structured usage data. We need to capture tokens and cost for budget tracking.

The fix: add `--output-format json` to the worker's `claude -p` call, and parse the JSON for usage data after the run. But there's a problem — `--output-format json` wraps the output in JSON, and we currently parse raw stdout for markers (`===PROPOSED_DIFF_START===`, etc.). We need to extract the text content from the JSON first.

**Step 1: Modify the claude -p invocation to capture JSON output**

In `run_worker()` around line 217, change:

```bash
# Before:
if timeout 600 claude -p "$prompt" --max-turns 30 --allowedTools "Read,Write,Edit,Glob,Grep,Bash" < /dev/null 2>&1 | tee "$output_file"; then
```

To:

```bash
# After:
local json_output="$LOG_DIR/$DATE-worker-$short_id-output.json"
if timeout 600 claude -p "$prompt" --max-turns 30 --output-format json --allowedTools "Read,Write,Edit,Glob,Grep,Bash" < /dev/null > "$json_output" 2>"$output_file.stderr"; then
  # Extract text content from JSON for marker parsing
  python3 -c "
import json, sys
with open('$json_output') as f:
    data = json.load(f)
# Extract result text from the JSON output
result = data.get('result', '')
if isinstance(result, list):
    result = '\n'.join(str(r.get('text', '')) if isinstance(r, dict) else str(r) for r in result)
print(result)
" > "$output_file" 2>/dev/null || cp "$json_output" "$output_file"
```

**Step 2: Extract usage data from JSON output**

After the worker completes (inside the success branch, around line 220), add usage extraction:

```bash
    # Extract usage telemetry
    local tokens_input=0 tokens_output=0 cost_usd=0
    if [ -f "$json_output" ]; then
      read -r tokens_input tokens_output cost_usd < <(python3 -c "
import json
with open('$json_output') as f:
    data = json.load(f)
usage = data.get('usage', {})
ti = usage.get('input_tokens', 0)
to = usage.get('output_tokens', 0)
cost = data.get('cost_usd', 0)
print(f'{ti} {to} {cost}')
" 2>/dev/null || echo "0 0 0")
      log "USAGE: $short_id — ${tokens_input}+${tokens_output} tokens, \$${cost_usd}"
    fi
```

**Step 3: Include usage data in agent_runs_v2 insert**

Update the `agent_runs_v2` insert (around line 264) to include token/cost data:

```bash
  curl -s \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"agent_id\":\"worker\",\"project\":\"$project\",\"work_item_id\":\"$item_id\",\"trigger\":\"github_actions\",\"status\":\"completed\",\"completed_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"tokens_used\":$((tokens_input + tokens_output)),\"cost_estimate\":$cost_usd}" \
    "$SUPABASE_URL/rest/v1/agent_runs_v2" > /dev/null 2>&1 || true
```

**Step 4: Test the python extraction locally**

Create a test JSON file and verify the extraction works:

```bash
echo '{"result":"test output","usage":{"input_tokens":500,"output_tokens":200},"cost_usd":0.003}' > /tmp/test-worker.json
python3 -c "
import json
with open('/tmp/test-worker.json') as f:
    data = json.load(f)
usage = data.get('usage', {})
print(f'{usage.get(\"input_tokens\",0)} {usage.get(\"output_tokens\",0)} {data.get(\"cost_usd\",0)}')
"
```

Expected: `500 200 0.003`

**Step 5: Commit**

```bash
cd /Volumes/Lexar/Projects/infrastructure
git add agents/workers/work-loop-manager.sh
git commit -m "feat: add cost/token telemetry to worker execution"
```

---

### Task 5: Dashboard — Execution Status + Diff Review Polish

**Files:**
- Modify: `/Volumes/Lexar/Projects/Mainline Apps/dashboard/src/components/cockpit/UnifiedActionQueue.tsx`
- Modify: `/Volumes/Lexar/Projects/Mainline Apps/dashboard/src/components/CommandCenterContent.tsx`

**Context for engineer:**
The dashboard already handles `code_review` items in the UnifiedActionQueue — when `item.status === 'review' && item.proposed_diff`, it renders a diff viewer with accept/rework buttons. But there are gaps:

1. Items in `in_progress` status (worker is currently executing) don't show any indicator
2. The `execution_log` field (worker's summary) isn't displayed anywhere
3. The Command Center table doesn't distinguish between human-created items and auto-executed ones

This task adds: (a) an "executing..." indicator for in_progress items assigned to `worker-agent`, (b) the execution log displayed above the diff viewer.

**Step 1: Read the current UnifiedActionQueue component**

Read: `/Volumes/Lexar/Projects/Mainline Apps/dashboard/src/components/cockpit/UnifiedActionQueue.tsx`

Understand the current rendering for `code_review` items and where to add the execution log.

**Step 2: Add execution log display to code review items**

Find the section that renders `code_review` items (should have a diff viewer). Add above the diff:

```tsx
{item.item.execution_log && (
  <div className="bg-slate-700/30 rounded-lg px-3 py-2 mb-2">
    <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Worker Summary</p>
    <p className="text-xs text-slate-300 whitespace-pre-wrap">{item.item.execution_log}</p>
  </div>
)}
```

**Step 3: Add in_progress indicator for worker-assigned items**

In the queue rendering, add a check: if `item.status === 'in_progress' && item.assigned_to === 'worker-agent'`, show a pulsing indicator instead of action buttons:

```tsx
{item.item.status === 'in_progress' && item.item.assigned_to === 'worker-agent' && (
  <div className="flex items-center gap-2">
    <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
    <span className="text-xs text-blue-300">Worker executing...</span>
  </div>
)}
```

**Step 4: Add "Auto-approved" badge to auto-approved items**

When rendering work items, if `item.system_recommendation` is set, show a small badge:

```tsx
{item.item.system_recommendation && (
  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-medium">
    Auto
  </span>
)}
```

**Step 5: Verify the build passes**

Run: `cd "/Volumes/Lexar/Projects/Mainline Apps/dashboard" && npx next build`

Expected: Build succeeds with no type errors.

**Step 6: Commit**

```bash
cd "/Volumes/Lexar/Projects/Mainline Apps/dashboard"
git add src/components/cockpit/UnifiedActionQueue.tsx src/components/CommandCenterContent.tsx
git commit -m "feat: show worker execution status and auto-approved badge in dashboard"
```

---

### Task 6: Smoke Test the Full Pipeline

**Files:**
- No code changes — this is a manual verification task

**Context for engineer:**
Before the next nightly run activates the workers, we need to verify the entire pipeline works end-to-end. We can do this by manually triggering the workflow via `workflow_dispatch`.

**Step 1: Verify there are auto-approved items in the database**

```bash
source ~/.claude/.env
curl -s \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$SUPABASE_URL/rest/v1/work_items?status=eq.approved&system_recommendation=not.is.null&source_type=eq.agent&select=id,title,project,system_recommendation,system_confidence&limit=5" | python3 -m json.tool
```

Expected: At least 1 item. If empty, tonight's nightly run will populate them (L3 categories will auto-approve).

**Step 2: Push all changes to GitHub**

```bash
cd /Volumes/Lexar/Projects/infrastructure
git push origin main
```

**Step 3: Trigger a manual workflow run**

```bash
gh workflow run nightly-review.yml --ref main
```

Or wait for tonight's 2am CST cron run.

**Step 4: Monitor the workflow**

```bash
gh run list --workflow=nightly-review.yml --limit 3
# Then watch the specific run:
gh run watch <run-id>
```

**Step 5: Verify worker results in Supabase**

After the run completes, check for items that moved to `review` status with proposed diffs:

```bash
curl -s \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$SUPABASE_URL/rest/v1/work_items?status=eq.review&assigned_to=eq.worker-agent&select=id,title,project,status,proposed_diff,execution_log&limit=5" | python3 -m json.tool
```

Expected: Items with `proposed_diff` populated and `execution_log` showing the worker's summary.

**Step 6: Review a diff in the dashboard**

Open `app.mainlineapps.com` → Cockpit. Items with worker diffs should appear in the Action Queue as code review items. Use Accept/Rework buttons to resolve them.

---

## Rollback Plan

If workers produce bad results:

1. **Immediate:** Set `EXECUTION_MODE: 'dry_run'` back in the YAML and push
2. **Items in review:** Can be rejected from the dashboard (they don't auto-merge)
3. **Items in_progress:** Will timeout after 10 minutes and go to `review` status automatically
4. **Nuclear option:** Remove the `system_recommendation=not.is.null` filter to stop all worker execution

## Future Enhancements (NOT in this plan)

- **PR creation:** Workers create real GitHub PRs instead of storing diffs in Supabase
- **L4 auto-merge:** For L4 categories, skip human review and auto-merge the diff
- **Parallel workers:** Run multiple workers concurrently (currently sequential)
- **Smart batching:** Group related findings into a single worker session
- **Cost caps:** Add per-run and per-night cost limits to prevent runaway spend
