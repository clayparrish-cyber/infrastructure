# Agent-to-Agent Delegation Architecture — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable agents to request specialist agents (legal, marketing, competitive-intel, business-analyst) for follow-up analysis, creating a lateral collaboration network where findings flow between agents before reaching Clay.

**Architecture:** Scout agents create `research_request` work items with `assigned_to` pointing to the specialist agent they need. The existing worker job (Job 6) already queries approved+unassigned items and dispatches `claude -p`. We extend it to also pick up specialist requests using dedicated prompt templates. Specialists produce analysis that links back to the originating item via `parent_id`. The orchestrator's skip rule (#10) is relaxed to allow specialist dispatch when requests exist. A new `delegation` work item type distinguishes these from code-fixing `finding` items.

**Tech Stack:** Bash (work-loop-manager.sh), GitHub Actions YAML, Markdown prompt templates, Supabase (work_items table)

---

## Overview

### Current Flow (Linear)
```
Scout finds issue → work_item (finding) → Clay approves → Worker fixes code → Clay reviews diff
```

### New Flow (Lateral Collaboration)
```
Scout finds issue needing specialist input
  → creates work_item (type: delegation, assigned_to: legal-advisor)
  → auto-approved by system (delegations skip human gate)
  → next nightly: worker dispatches specialist prompt
  → specialist produces analysis as child work_item (parent_id links to original)
  → analysis lands in Clay's cockpit (or feeds back to originating scout's next run)
```

### What Already Exists
- `work_items.parent_id` column — already in schema, unused
- `work_items.assigned_to` — used by worker to claim items
- `work_items.type` — currently `finding`, `task`, `initiative`
- Worker job queries `status=approved&assigned_to=is.null` — we need specialist items to use `assigned_to=<agent_id>` and a separate query
- Specialist agent prompt files exist: `agents/reviews/org-development.md` (others need creation)
- Orchestrator skip rule #10 already lists on-demand agents to skip

### What This Plan Builds
1. **Task 1:** Add `delegation` work item type + DB migration
2. **Task 2:** Create specialist prompt templates (4 agents)
3. **Task 3:** Teach scout prompts how to create delegation requests
4. **Task 4:** Extend worker job to dispatch specialist requests
5. **Task 5:** Auto-approve delegation requests (skip human gate)
6. **Task 6:** Dashboard: show delegation chains in cockpit
7. **Task 7:** Fix work-loop-manager self-logging bug
8. **Task 8:** Wire evaluator + business-synthesis into Sunday nightly
9. **Task 9:** Add Slack notification on nightly completion/failure
10. **Task 10:** Add per-night cost governor

---

### Task 1: Add `delegation` Work Item Type

**Files:**
- Modify: `${PROJECTS_DIR}/dashboard/src/lib/database.types.ts` (if enum is defined there)
- Modify: Supabase migration (SQL)

**Context for engineer:**
The `work_items.type` column is a text field (not a Postgres enum — the API validates via Zod on the dashboard side). Current values: `finding`, `task`, `initiative`. We need to add `delegation` as a recognized type. We also want to add `research_request` as a recognized type for when scouts need specialist input that isn't code-related.

**Step 1: Check the Zod validation schema for work item types**

Read: `${PROJECTS_DIR}/dashboard/src/app/api/work-items/route.ts`

Find the Zod schema that validates `type`. Add `'delegation'` and `'research_request'` to the union.

**Step 2: Update the type definition**

In `database.types.ts` or wherever the `WorkItem` type is defined, ensure the `type` field includes the new values.

**Step 3: Verify the build passes**

Run: `cd "${PROJECTS_DIR}/dashboard" && npx next build`

**Step 4: Commit**

```bash
cd "${PROJECTS_DIR}/dashboard"
git add src/lib/database.types.ts src/app/api/work-items/route.ts
git commit -m "feat: add delegation and research_request work item types"
```

---

### Task 2: Create Specialist Prompt Templates

**Files:**
- Create: `${PROJECTS_DIR}/infrastructure/agents/specialists/legal-review.md`
- Create: `${PROJECTS_DIR}/infrastructure/agents/specialists/marketing-analysis.md`
- Create: `${PROJECTS_DIR}/infrastructure/agents/specialists/competitive-intel.md`
- Create: `${PROJECTS_DIR}/infrastructure/agents/specialists/business-analysis.md`

**Context for engineer:**
These prompts are invoked by the worker job when a delegation request targets a specialist agent. They follow the same marker pattern as `implement-finding.md` but produce analysis instead of code diffs. The output is a new work_item (child of the delegation request) with type `task` or `initiative` containing the specialist's analysis.

Each prompt receives the same template variables as `implement-finding.md`:
- `{{WORK_ITEM_ID}}`, `{{TITLE}}`, `{{DESCRIPTION}}`, `{{PROJECT}}`, `{{PRIORITY}}`
- Plus new: `{{PARENT_ID}}` (the originating item), `{{REQUESTING_AGENT}}` (who asked)

**Step 1: Create the specialists directory**

```bash
mkdir -p ${PROJECTS_DIR}/infrastructure/agents/specialists
```

**Step 2: Create legal-review.md**

```markdown
# Specialist Agent: Legal Review

You are the Legal Review specialist. Another agent has requested your analysis on a compliance, privacy, or regulatory matter.

## Request Context

- **Request ID:** {{WORK_ITEM_ID}}
- **Requested by:** {{REQUESTING_AGENT}}
- **Title:** {{TITLE}}
- **Details:** {{DESCRIPTION}}
- **Project:** {{PROJECT}}

## Your Job

1. Read CLAUDE.md in the current directory for project context
2. Analyze the request against applicable regulations (GDPR, CCPA, COPPA, App Store guidelines, FTC)
3. Check current code for privacy policies, data handling, consent flows
4. Produce a clear recommendation: COMPLIANT / NEEDS_CHANGES / BLOCKED

## Output Format

Your stdout MUST contain:

===ANALYSIS_START===
**Assessment:** [COMPLIANT / NEEDS_CHANGES / BLOCKED]
**Summary:** [2-3 sentence plain-English assessment]
**Details:**
- [Specific finding 1]
- [Specific finding 2]
**Recommendation:** [What to do next — be specific]
**Risk Level:** [low / medium / high / critical]
===ANALYSIS_END===

===WORK_ITEMS_START===
[JSON array of work items to create, or empty array]
[
  {
    "type": "task",
    "title": "...",
    "description": "...",
    "priority": "medium",
    "parent_id": "{{PARENT_ID}}"
  }
]
===WORK_ITEMS_END===

## Constraints

- Do NOT make code changes — you are advisory only
- Maximum 3 work items per analysis
- Include specific file:line references when citing code issues
- If the request is outside your expertise, say so clearly
```

**Step 3: Create marketing-analysis.md**

Follow the same pattern but focused on: campaign performance, attribution analysis, content strategy, ASO, competitive positioning. Assessment options: PROCEED / ADJUST / PAUSE.

**Step 4: Create competitive-intel.md**

Follow the same pattern but focused on: competitor features, market positioning, pricing analysis, app store ranking. Assessment: AHEAD / PARITY / BEHIND.

**Step 5: Create business-analysis.md**

Follow the same pattern but focused on: KPI analysis, revenue projections, cohort analysis, growth metrics. Assessment: ON_TRACK / WATCH / OFF_TRACK.

**Step 6: Commit**

```bash
cd ${PROJECTS_DIR}/infrastructure
git add agents/specialists/
git commit -m "feat: add specialist agent prompt templates for delegation"
```

---

### Task 3: Teach Scout Prompts to Create Delegation Requests

**Files:**
- Modify: `${PROJECTS_DIR}/infrastructure/agents/reviews/sidelineiq/*.md` (all 6 review prompts)
- Modify: `${PROJECTS_DIR}/infrastructure/agents/reviews/dosie/*.md`
- Modify: `${PROJECTS_DIR}/infrastructure/agents/reviews/glossy-sports/*.md`
- Modify: (and other project review dirs)

**Context for engineer:**
Each scout agent has 6 review prompt files (one per theme: security, ux, bugs, content, polish, performance). We need to add a section to each prompt explaining how to create a delegation request when the scout finds something outside its expertise.

Rather than editing all ~48 prompt files, we'll create a shared include file and reference it from the prompts.

**Step 1: Create the delegation instructions include**

Create: `${PROJECTS_DIR}/infrastructure/agents/includes/delegation-instructions.md`

```markdown
## Requesting Specialist Help

If during your review you discover an issue that requires specialist expertise beyond your scope, you can request a specialist agent to analyze it. Add a delegation block to your findings JSON:

```json
{
  "delegations": [
    {
      "specialist": "legal-advisor",
      "title": "Review COPPA compliance for user profile collection",
      "description": "The onboarding flow collects age and name without parental consent gate. Need legal review of COPPA applicability.",
      "priority": "high",
      "context": "Found in src/app/onboarding/page.tsx — collecting user data at lines 45-67"
    }
  ]
}
```

**Available specialists:**
- `legal-advisor` — privacy, compliance, regulations, app store guidelines
- `marketing-analyst` — campaign performance, attribution, content strategy
- `competitive-intel` — competitor analysis, market positioning, feature gaps
- `business-analyst` — KPI analysis, revenue projections, growth metrics

**Rules:**
- Only create delegations for genuinely cross-functional issues
- Maximum 2 delegations per review run
- Include enough context that the specialist can work independently
- Do NOT create delegations for things you can assess yourself
```

**Step 2: Add an include reference to the sync script**

Modify: `${PROJECTS_DIR}/infrastructure/agents/lib/sync-to-supabase.ts`

In the `syncProject()` function, after parsing findings, check for a `delegations` array in the report JSON. For each delegation, create a work_item with:
- `type: 'delegation'`
- `status: 'approved'` (auto-approved — no human gate needed)
- `assigned_to: delegation.specialist`
- `source_type: 'agent'`
- `source_id: agentId` (the scout that requested it)
- `parent_id`: the work_item ID of the finding that triggered it (if one exists)
- `metadata: { requesting_agent: agentId, delegation_context: delegation.context }`

```typescript
// After the findings loop, process delegations
if (report.delegations && Array.isArray(report.delegations)) {
  for (const delegation of report.delegations) {
    const { data: delegationItem, error: delError } = await supabase
      .from('work_items')
      .insert({
        type: 'delegation',
        project,
        title: delegation.title,
        description: delegation.description,
        status: 'approved', // Auto-approved — skip human gate
        priority: delegation.priority || 'medium',
        source_type: 'agent',
        source_id: agentId,
        created_by: agentId,
        assigned_to: delegation.specialist,
        decision_category: `delegation-${delegation.specialist}`,
        metadata: {
          requesting_agent: agentId,
          delegation_context: delegation.context,
          specialist: delegation.specialist,
        },
      })
      .select('id')
      .single();

    if (delegationItem) {
      await supabase.from('work_item_events').insert({
        work_item_id: delegationItem.id,
        event_type: 'delegated',
        actor: agentId,
        actor_type: 'agent',
        notes: `${agentId} requested ${delegation.specialist} review`,
      });
      console.log(`      Delegated to ${delegation.specialist}: ${delegation.title}`);
    }
  }
}
```

**Step 3: Append delegation instructions to one scout prompt as a test**

Pick one prompt file (e.g., `agents/reviews/sidelineiq/security-review.md`) and append the contents of `agents/includes/delegation-instructions.md` at the bottom. This tests that scouts can produce the delegation JSON.

**Step 4: Commit**

```bash
cd ${PROJECTS_DIR}/infrastructure
git add agents/includes/ agents/lib/sync-to-supabase.ts agents/reviews/sidelineiq/security-review.md
git commit -m "feat: enable scout agents to create specialist delegation requests"
```

---

### Task 4: Extend Worker Job to Dispatch Specialist Requests

**Files:**
- Modify: `${PROJECTS_DIR}/infrastructure/agents/workers/work-loop-manager.sh`
- Create: `${PROJECTS_DIR}/infrastructure/agents/workers/run-specialist.md`

**Context for engineer:**
The worker job currently queries `status=approved&assigned_to=is.null&system_recommendation=not.is.null&source_type=eq.agent` — this catches auto-approved agent findings for code fixing. Delegation requests are different: they have `assigned_to=<specialist_id>` (not null) and `type=delegation`. We need a second query to pick these up and dispatch them using specialist prompts instead of `implement-finding.md`.

**Step 1: Create the specialist dispatch prompt template**

Create: `${PROJECTS_DIR}/infrastructure/agents/workers/run-specialist.md`

This is a meta-template that wraps the specialist-specific prompt:

```markdown
# Specialist Dispatch

You are being dispatched as a specialist agent to analyze a delegation request.

## Request
- **ID:** {{WORK_ITEM_ID}}
- **Title:** {{TITLE}}
- **Description:** {{DESCRIPTION}}
- **Project:** {{PROJECT}}
- **Requested by:** {{REQUESTING_AGENT}}
- **Parent item:** {{PARENT_ID}}

## Instructions

Read and follow the specialist prompt at: {{SPECIALIST_PROMPT_PATH}}

After completing your analysis, output the standard markers.

## Output Rules

Your stdout MUST contain these sections:

===ANALYSIS_START===
<your analysis here>
===ANALYSIS_END===

===EXECUTION_LOG_START===
Summary: Specialist analysis completed for {{TITLE}}
Specialist: {{SPECIALIST_ID}}
Assessment: <your assessment>
===EXECUTION_LOG_END===

If you create follow-up work items, also output:

===WORK_ITEMS_START===
<JSON array of work items>
===WORK_ITEMS_END===
```

**Step 2: Add specialist dispatch function to work-loop-manager.sh**

After the existing `fetch_approved_items()` function, add:

```bash
# Fetch delegation requests assigned to specialist agents
fetch_delegation_items() {
  local raw
  raw=$(curl -s \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    "$SUPABASE_URL/rest/v1/work_items?status=eq.approved&type=eq.delegation&assigned_to=not.is.null&select=id,title,description,project,priority,type,source_type,source_id,assigned_to,parent_id,metadata&order=created_at.asc&limit=5")

  echo "$raw"
}
```

**Step 3: Add specialist runner function**

After `run_worker()`, add `run_specialist()` — similar to `run_worker()` but:
- Uses `run-specialist.md` as the prompt template
- Adds `{{SPECIALIST_ID}}`, `{{SPECIALIST_PROMPT_PATH}}`, `{{REQUESTING_AGENT}}`, `{{PARENT_ID}}` to template variables
- Parses `===ANALYSIS_START===` / `===ANALYSIS_END===` markers
- Parses `===WORK_ITEMS_START===` / `===WORK_ITEMS_END===` for child items to create
- Sets the delegation item to `done` with the analysis as `execution_log`
- Creates any child work_items with `parent_id` linking back

**Step 4: Update the main loop to process delegations after regular items**

At the bottom of the script, after the regular worker loop:

```bash
# Process specialist delegation requests
DELEGATIONS=$(fetch_delegation_items)
DELEGATION_COUNT=$(echo "$DELEGATIONS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)

if [ "$DELEGATION_COUNT" -gt 0 ]; then
  log "Found $DELEGATION_COUNT delegation request(s) to process"

  DELEGATION_FILE=$(mktemp)
  echo "$DELEGATIONS" | python3 -c "
import sys, json
items = json.load(sys.stdin)
for item in items:
    print(json.dumps(item))
" > "$DELEGATION_FILE"

  while IFS= read -r item_json; do
    [ -z "$item_json" ] && continue
    run_specialist "$item_json" || true
  done < "$DELEGATION_FILE"

  rm -f "$DELEGATION_FILE"
fi
```

**Step 5: Commit**

```bash
cd ${PROJECTS_DIR}/infrastructure
git add agents/workers/
git commit -m "feat: extend worker job to dispatch specialist delegation requests"
```

---

### Task 5: Auto-Approve Delegation Requests

**Files:**
- Modify: `${PROJECTS_DIR}/infrastructure/agents/lib/sync-to-supabase.ts`

**Context for engineer:**
Delegation requests should skip the human approval gate entirely — they're agent-to-agent communication, not findings for Clay to triage. The sync script already creates them with `status: 'approved'` (from Task 3). But we also need to ensure the autonomy system doesn't interfere. Since delegations have `decision_category: 'delegation-<specialist>'`, we need to make sure `applyRecommendation()` and `maybeAutoApprove()` gracefully handle (or skip) delegation items.

**Step 1: Add delegation skip to applyRecommendation()**

At the top of `applyRecommendation()`, add:

```typescript
// Delegations are auto-approved by the creating agent — skip shadow recommender
if (category.startsWith('delegation-')) return;
```

**Step 2: Add delegation skip to maybeAutoApprove()**

At the top of `maybeAutoApprove()`, add:

```typescript
// Delegations are already approved at creation — skip
if (category.startsWith('delegation-')) return;
```

**Step 3: Commit**

```bash
cd ${PROJECTS_DIR}/infrastructure
git add agents/lib/sync-to-supabase.ts
git commit -m "feat: skip autonomy checks for delegation items"
```

---

### Task 6: Dashboard — Show Delegation Chains in Cockpit

**Files:**
- Modify: `${PROJECTS_DIR}/dashboard/src/components/cockpit/UnifiedActionQueue.tsx`
- Modify: `${PROJECTS_DIR}/dashboard/src/components/CommandCenterContent.tsx`

**Context for engineer:**
When a specialist produces analysis that creates child work_items, those items should show their delegation lineage in the cockpit. A child item should display "Requested by security-review → Analyzed by legal-advisor" so Clay understands the provenance.

**Step 1: Show delegation badge on items with parent_id**

In the queue item rendering, when an item has `parent_id` set and metadata containing `requesting_agent`:

```tsx
{item.item.parent_id && item.item.metadata?.requesting_agent && (
  <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-medium">
    via {item.item.metadata.requesting_agent}
  </span>
)}
```

**Step 2: Show specialist analysis in execution_log area**

For items with `type === 'delegation'` that are `done`, show the analysis:

```tsx
{item.item.type === 'delegation' && item.item.execution_log && (
  <div className="bg-purple-900/20 rounded-lg px-3 py-2 mb-2 border border-purple-500/20">
    <p className="text-[10px] text-purple-400 uppercase tracking-wide mb-1">
      Specialist Analysis ({item.item.assigned_to})
    </p>
    <p className="text-xs text-slate-300 whitespace-pre-wrap">{item.item.execution_log}</p>
  </div>
)}
```

**Step 3: Verify build**

Run: `cd "${PROJECTS_DIR}/dashboard" && npx next build`

**Step 4: Commit**

```bash
cd "${PROJECTS_DIR}/dashboard"
git add src/components/cockpit/UnifiedActionQueue.tsx src/components/CommandCenterContent.tsx
git commit -m "feat: show delegation chain and specialist analysis in cockpit"
```

---

### Task 7: Fix work-loop-manager Self-Logging Bug

**Files:**
- Modify: `${PROJECTS_DIR}/infrastructure/agents/workers/work-loop-manager.sh`

**Context for engineer:**
The work-loop-manager script logs individual worker runs to `agent_runs_v2` with `agent_id: "worker"`, but never logs its own execution. This means the `work-loop-manager` agent in Supabase always shows as "stale" in the reliability score. Fix: add a self-log at the start and end of the script.

**Step 1: Add self-log at script start**

After the `log "=== Work Loop Manager starting..."` line, add:

```bash
# Log manager run start to agent_runs_v2
MANAGER_RUN_START=$(date -u +%Y-%m-%dT%H:%M:%SZ)
curl -s \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"agent_id\":\"work-loop-manager\",\"project\":\"all\",\"trigger\":\"github_actions\",\"status\":\"running\",\"started_at\":\"$MANAGER_RUN_START\"}" \
  "$SUPABASE_URL/rest/v1/agent_runs_v2" > /dev/null 2>&1 || true
```

**Step 2: Add self-log at script end**

Before the final `log "=== Work Loop Manager complete ==="` line, add:

```bash
# Log manager run completion
curl -s -X PATCH \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d "{\"status\":\"completed\",\"completed_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"findings_count\":$ITEM_COUNT}" \
  "$SUPABASE_URL/rest/v1/agent_runs_v2?agent_id=eq.work-loop-manager&started_at=eq.$MANAGER_RUN_START" || true
```

**Step 3: Commit**

```bash
cd ${PROJECTS_DIR}/infrastructure
git add agents/workers/work-loop-manager.sh
git commit -m "fix: log work-loop-manager own execution to agent_runs_v2"
```

---

### Task 8: Wire Evaluator + Business-Synthesis into Sunday Nightly

**Files:**
- Modify: `${PROJECTS_DIR}/infrastructure/.github/workflows/nightly-review.yml`
- Create: `${PROJECTS_DIR}/infrastructure/agents/ops/business-synthesis.md` (if not exists)

**Context for engineer:**
The evaluator and business-synthesis agents need to run on Sundays as part of the nightly workflow. They should run AFTER the regular review agents and sync, since they analyze the output of those runs. Add them as an additional step in the `reconcile` job (which already runs after sync) or as a new job.

**Step 1: Check if business-synthesis prompt exists**

```bash
ls ${PROJECTS_DIR}/infrastructure/agents/ops/
```

If `business-synthesis.md` doesn't exist, create it with a prompt that:
- Queries `work_items` and `agent_runs_v2` for the past week
- Produces a cross-project summary: what was found, what was fixed, what's stuck
- Creates a single `initiative` work_item as a weekly briefing for Clay
- Maximum 500 words — concise executive summary

**Step 2: Add Sunday-only evaluation step to the reconcile job**

In `nightly-review.yml`, in the `reconcile` job, add a step:

```yaml
      - name: Run evaluator and synthesis (Sundays only)
        if: contains(needs.setup.outputs.day_of_week, 'Sunday') || contains(needs.setup.outputs.day_of_week, '0')
        timeout-minutes: 20
        env:
          PROJECTS_DIR: ${{ github.workspace }}/projects
          DATE: ${{ needs.setup.outputs.date }}
        run: |
          WORKSPACE="${{ github.workspace }}"

          echo "=========================================="
          echo "Running Weekly Evaluator"
          echo "=========================================="

          cd "$WORKSPACE"
          if timeout 600 claude -p "$(cat "$WORKSPACE/agents/ops/org-development.md")" \
            --max-turns 30 --output-format json \
            --allowedTools "Read,Glob,Grep,Bash" < /dev/null > logs/$DATE-evaluator.json 2>&1; then
            echo "SUCCESS: Evaluator"
          else
            echo "WARNING: Evaluator failed"
          fi

          echo "=========================================="
          echo "Running Business Synthesis"
          echo "=========================================="

          if timeout 600 claude -p "$(cat "$WORKSPACE/agents/ops/business-synthesis.md")" \
            --max-turns 30 --output-format json \
            --allowedTools "Read,Glob,Grep,Bash" < /dev/null > logs/$DATE-business-synthesis.json 2>&1; then
            echo "SUCCESS: Business Synthesis"
          else
            echo "WARNING: Business Synthesis failed"
          fi
```

**Step 3: Re-activate evaluator in Supabase**

```bash
source ~/.claude/.env
curl -s -X PATCH \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  "$SUPABASE_URL/rest/v1/agents?id=eq.evaluator" \
  -d '{"status":"active"}'
```

**Step 4: Commit**

```bash
cd ${PROJECTS_DIR}/infrastructure
git add .github/workflows/nightly-review.yml agents/ops/
git commit -m "feat: wire evaluator and business synthesis into Sunday nightly"
```

---

### Task 9: Add Slack Notification on Nightly Completion

**Files:**
- Modify: `${PROJECTS_DIR}/infrastructure/.github/workflows/nightly-review.yml`

**Context for engineer:**
Clay has Slack MCP wired via Claude AI. We can use a simple webhook or the Slack API to post a summary when the nightly run completes. GitHub Actions supports Slack notifications via webhook URL.

**Step 1: Add a notification job at the end of the pipeline**

Add after the `reconcile` job:

```yaml
  # ─────────────────────────────────────────────
  # Job 8: Notify on completion
  # ─────────────────────────────────────────────
  notify:
    runs-on: ubuntu-latest
    needs: [setup, reviews, sync, workers, reconcile]
    if: always() && github.event_name != 'push'
    steps:
      - name: Build summary
        id: summary
        env:
          REVIEWS_RESULT: ${{ needs.reviews.result }}
          SYNC_RESULT: ${{ needs.sync.result }}
          WORKERS_RESULT: ${{ needs.workers.result }}
          RECONCILE_RESULT: ${{ needs.reconcile.result }}
        run: |
          STATUS="success"
          EMOJI="✅"

          for result in "$REVIEWS_RESULT" "$SYNC_RESULT" "$WORKERS_RESULT" "$RECONCILE_RESULT"; do
            if [ "$result" = "failure" ]; then
              STATUS="failure"
              EMOJI="🔴"
              break
            elif [ "$result" = "cancelled" ]; then
              STATUS="partial"
              EMOJI="⚠️"
            fi
          done

          echo "status=$STATUS" >> "$GITHUB_OUTPUT"
          echo "emoji=$EMOJI" >> "$GITHUB_OUTPUT"

      - name: Post to Slack
        if: env.SLACK_WEBHOOK_URL != ''
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
        run: |
          curl -s -X POST "$SLACK_WEBHOOK_URL" \
            -H "Content-Type: application/json" \
            -d "{
              \"text\": \"${{ steps.summary.outputs.emoji }} Nightly Agent Run — ${{ needs.setup.outputs.date }}\nReviews: ${{ needs.reviews.result }} | Sync: ${{ needs.sync.result }} | Workers: ${{ needs.workers.result }} | Reconcile: ${{ needs.reconcile.result }}\n<https://github.com/${{ github.repository }}/actions/runs/${{ github.run_id }}|View Run>\"
            }"
```

**Step 2: Add SLACK_WEBHOOK_URL secret to GitHub repo**

This is a manual step — go to Settings → Secrets → Actions → New secret. Create a Slack incoming webhook URL from the Slack API dashboard.

If no webhook is set, the notification step silently skips (`if: env.SLACK_WEBHOOK_URL != ''`).

**Step 3: Commit**

```bash
cd ${PROJECTS_DIR}/infrastructure
git add .github/workflows/nightly-review.yml
git commit -m "feat: add Slack notification on nightly run completion"
```

---

### Task 10: Add Per-Night Cost Governor

**Files:**
- Modify: `${PROJECTS_DIR}/infrastructure/agents/workers/work-loop-manager.sh`

**Context for engineer:**
Add a cumulative cost check after each worker run. If total spend exceeds the nightly cap ($10 default), stop processing remaining items and log a warning.

**Step 1: Add cost tracking variables after the main loop setup**

```bash
NIGHTLY_COST_CAP="${NIGHTLY_COST_CAP:-10.00}"
CUMULATIVE_COST=0
```

**Step 2: After each worker run, accumulate cost and check cap**

Inside the worker processing loop, after `run_worker`:

```bash
  # Accumulate cost (tokens_input/output/cost_usd are set inside run_worker)
  CUMULATIVE_COST=$(python3 -c "print(round($CUMULATIVE_COST + ${cost_usd:-0}, 4))")

  if python3 -c "exit(0 if $CUMULATIVE_COST >= $NIGHTLY_COST_CAP else 1)"; then
    log "COST CAP: Cumulative cost \$$CUMULATIVE_COST exceeds nightly cap \$$NIGHTLY_COST_CAP — stopping"
    break
  fi
```

Note: `cost_usd` is a local variable inside `run_worker()`, so we need to export it or restructure slightly. Simplest: after the run_worker call, parse the log for the cost line, or make `cost_usd` available via a temp file.

**Step 3: Commit**

```bash
cd ${PROJECTS_DIR}/infrastructure
git add agents/workers/work-loop-manager.sh
git commit -m "feat: add per-night cost governor to worker pipeline"
```

---

## Execution Order & Dependencies

```
Task 1 (DB types) ─────────────────────────────────────> can start immediately
Task 2 (specialist prompts) ───────────────────────────> can start immediately
Task 3 (scout delegation + sync) ─────────────────────> depends on Task 1, 2
Task 4 (worker dispatch) ─────────────────────────────> depends on Task 2
Task 5 (auto-approve delegations) ────────────────────> depends on Task 3
Task 6 (dashboard UI) ────────────────────────────────> depends on Task 1
Task 7 (manager self-logging bug) ────────────────────> independent
Task 8 (evaluator + synthesis wiring) ────────────────> independent
Task 9 (Slack notifications) ─────────────────────────> independent
Task 10 (cost governor) ──────────────────────────────> independent
```

Tasks 7, 8, 9, 10 are independent and can run in parallel with everything else.
Tasks 1+2 can run in parallel, then 3+4 in parallel, then 5+6 in parallel.

## Rollback Plan

- Delegation items are a new type — existing items unaffected
- Specialist prompts are new files — no existing code changed
- Worker dispatch uses a separate query — regular worker flow unchanged
- If specialists produce bad output, items go to `review` for human triage (same as regular workers)

## Future Enhancements (NOT in this plan)

- **Agent-to-agent threads**: Multi-turn conversations where specialists can ask clarifying questions back to the requesting scout
- **Delegation routing rules**: Orchestrator decides which specialist to route to (instead of scout choosing)
- **Specialist memory**: Specialists remember past analyses and reference them in future reviews
- **Cross-night continuity**: If a specialist needs more context, it can request a follow-up delegation for the next night
