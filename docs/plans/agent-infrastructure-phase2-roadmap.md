# Agent Infrastructure Phase 2 Roadmap

## Executive Summary

The registry-driven architecture is solid and already supports scalable scheduling, tiering, and centralized reporting. The biggest bottleneck is execution reliability and lifecycle automation: the nightly runner is brittle on a sleeping laptop, the dashboard can only “fire-and-forget” runs without progress or durable job tracking, and findings aren’t deduplicated or auto-advanced into implementation. Phase 2 should prioritize a reliable runner (server-based or wake-on-schedule), a durable run/job model with progress telemetry, and a finding lifecycle that supports dedupe, auto-approval for low-risk items, and stale-task cleanup. This will unlock higher automation without compromising safety.

## Current State Assessment

### What’s Working
- **Registry-driven scheduling** provides a single source of truth for agent definitions, tiers, and scheduling. This scales well and matches the design doc’s goals.
- **Structured JSON outputs** exist for all review agents, enabling aggregation, decisions, and task creation.
- **Centralized task store (`tasks.json`)** is already wired into the dashboard APIs and creates a single surface for work.

### Gaps & Observations
- **Nightly runner reliability**: `nightly-runner.sh` requires a wakeful laptop. When the lid is closed, launchd triggers but `claude -p` never runs. This causes skipped runs and missing data.
- **Dashboard “Run Agents” execution**: `POST /api/agents/run` spawns `claude -p` directly from the Next.js server. This is fragile in sandboxed environments and provides limited observability.
- **Progress visibility**: A “running-*.json” sentinel is written, but there is no progress telemetry (turn count, stage, or live logs), and the UI likely polls only for existence.
- **Finding lifecycle gaps**:
  - **Deduplication**: report IDs incorporate `date`, so the same finding across runs is treated as a new item each time.
  - **Approval-to-implementation**: approvals create tasks but do not automatically execute changes. Clearing is manual or via a second action.
- **Metrics**: run logs are minimal, and there is no computed effectiveness score (approval ratio, fix rate, noise ratio).
- **Run log schema drift**: the runner writes `durationMs`, but the API-runner writes `duration` seconds. Types expect `duration`. This will skew dashboards.

## Proposed Improvements (Prioritized)

### P0 — Reliability & Execution (Foundational)
1. **Move scheduling to a server-based runner** (GitHub Actions or Vercel cron + server job runner)
   - Replace launchd dependency with a server cron that calls a runner script or API.
   - Benefits: runs even when laptop is asleep; centralized logs; easy retries.
   - Alternative (short-term): `pmset schedule` for wake-on-schedule + `caffeinate` guard.

2. **Introduce a durable “run queue” with job records**
   - Create a run queue file (e.g., `agent-reports/_meta/run-queue.json`) and a runner that consumes it.
   - Each run has `id`, `project`, `agent`, `status`, `startedAt`, `endedAt`, `turns`, `durationMs`, `logPath`.
   - The dashboard writes to queue instead of directly spawning `claude`.

3. **Unify run log schema**
   - Standardize on `durationMs`, `turns`, and `findings` across nightly runner and API runs.
   - Update types and any consumers accordingly.

### P1 — Finding Lifecycle Automation
4. **Content-hash deduplication**
   - Compute a `dedupeKey` per finding (e.g., hash of project + agent + title + file list + normalized description).
   - Store in `findings` or decisions to collapse duplicates across runs.
   - UI should group findings by `dedupeKey` and show “seen in X runs.”

5. **Auto-approve low severity + safe tags**
   - Add an agent-level policy config (`autoApprove: ["low"]` or per-agent rules).
   - Auto-approve + auto-create tasks for low-risk items (optionally only for trusted agents like security or bug-hunt).
   - Keep medium/high manual.

6. **Auto-close stale tasks**
   - Add `staleAfterDays` to task policy (e.g., 21–30 days).
   - Mark as `blocked` or `deferred` with an auto note, not deleted.
   - Use a weekly housekeeping job.

### P2 — Dashboard & Analytics
7. **Real-time progress & log streaming**
   - Add `GET /api/agents/run/:id` for job status.
   - Track state transitions: queued → running → finalizing → completed/failed.
   - Expose tail of log file for live updates.

8. **Effectiveness metrics**
   - Compute: approval rate, rejection rate, time-to-approve, time-to-fix, fix rate per agent & project.
   - Display “signal score” (approved / total) and “impact score” (resolved / approved).

9. **Historical trends & cross-project patterns**
   - Time series: findings by severity per project and per agent.
   - Pattern detection by dedupeKey across projects to spot systemic issues.

10. **Batching similar findings**
  - If multiple findings share `dedupeKey` or same path+title, create a single task with multiple references.
  - Add “related findings” list in task notes.

### P2 — Product & Workflow UX (Digital Brain)
11. **Unified triage inbox**
  - Single screen that merges tasks, agent findings, and quick-capture items.
  - Batch actions: approve, reject, defer, snooze, assign.

12. **Quick capture + smart classification**
  - Global capture bar that accepts freeform input (task/note/idea/link).
  - Auto-suggest project, priority, tags, due date, and type with one-click corrections.

13. **Daily Brief + Weekly Review**
  - Daily view: top priorities, due soon, blockers, new findings.
  - Weekly mode: stale tasks, unresolved findings, project health summary.

14. **Global search + linked memory**
  - Search across tasks, findings, decisions, notes, and reports.
  - Backlinks between tasks and findings to create “project memory.”

15. **Automation rules & batch grouping**
  - “If X then Y” rules (e.g., auto-create task for repeated low severity issues).
  - Auto-group similar findings into a single task with references.

16. **Personal domains support**
  - Add “Personal” and “Life Admin” entities alongside project cards.
  - Optional habit/reminder lightweight layer to keep everything in one dashboard.

## Implementation Plan With Dependencies

### Phase 2A (Reliability First) — 1–2 weeks
- **Server-based runner** (code + infra)
  - Add a lightweight runner service (Node script or GitHub Action) that reads registry and runs agents on schedule.
  - Dependencies: none.
  - Complexity: **Large** (infrastructure + deployment).

- **Run queue + job model** (code change)
  - New JSON store in `_meta` for run queue and job statuses.
  - Update dashboard `/api/agents/run` to enqueue instead of spawn.
  - Complexity: **Medium**.

- **Run log schema normalization** (code change)
  - Update runner and dashboard to use consistent fields.
  - Complexity: **Small**.

### Phase 2B (Lifecycle Automation) — 1 week
- **Deduplication keys** (code change)
  - Compute dedupeKey on report ingest; update decisions file schema to store it.
  - Dependency: run log schema update.
  - Complexity: **Medium**.

- **Auto-approve policy** (config + code)
  - Extend registry agent config with auto-approval rules.
  - Add scheduled “auto-triage” step after report ingest.
  - Dependency: dedupeKey support.
  - Complexity: **Medium**.

- **Stale task handling** (code + config)
  - Add task staleness policy and weekly cleanup job.
  - Dependency: run queue/job runner (to schedule or run weekly).
  - Complexity: **Small**.

### Phase 2C (Observability & Insights) — 1–2 weeks
- **Progress UI + log tail** (code change)
  - Add job status endpoint + UI widgets (progress, ETA, last log line).
  - Dependency: run queue + job model.
  - Complexity: **Medium**.

- **Effectiveness scoring + trends** (code change)
  - Compute metrics from `decisions.json`, `tasks.json`, and reports.
  - Add charts and per-agent scorecards.
  - Dependency: dedupeKey + consistent run logs.
  - Complexity: **Medium**.

- **Cross-project pattern detection** (code change)
  - Group findings by dedupeKey and by file path patterns.
  - Dependency: dedupeKey.
  - Complexity: **Medium**.

### Phase 2D (Product UX Expansion) — 1–2 weeks
- **Unified triage inbox** (code + UI)
  - Merge tasks, findings, and capture queue into one triage surface.
  - Dependency: run queue + task store stability.
  - Complexity: **Medium**.

- **Quick capture + smart classification** (code + UI)
  - Add capture input, lightweight classifier, and suggested tags/projects.
  - Dependency: task store + decisions store.
  - Complexity: **Medium**.

- **Daily Brief + Weekly Review mode** (code + UI)
  - Generate summary views from tasks/decisions/reports.
  - Dependency: consistent run logs.
  - Complexity: **Small**.

- **Global search + linked memory** (code + data)
  - Unified search endpoint and backlinks between tasks/findings/reports.
  - Dependency: dedupeKey.
  - Complexity: **Medium**.

- **Personal domains support** (config + UI)
  - Extend registry/entities to include personal domains.
  - Complexity: **Small**.

## Risk Considerations

- **Security & access**: Moving to server-based runners requires secure storage for repo access and any Claude credentials. Limit scope to read-only unless needed, and isolate per project.
- **False positives**: Auto-approving low-severity findings could flood tasks unless dedupe is in place. Gate auto-approval by agent and use dedupe keys.
- **Data drift**: Schema changes across run logs and decisions require careful migration to avoid breaking the dashboard.
- **Cost & rate limits**: Centralized runners may increase token usage. Add per-project caps and adaptive depth controls.
- **Partial automation risk**: Auto-implementing code without human review should be limited to low-risk changes and require a clear rollback path.

---

## Suggested Next Steps
1. Decide on **runner hosting** (GitHub Actions vs Vercel Cron vs local wake schedule).
2. Implement **run queue + job model** and update dashboard run endpoint to enqueue.
3. Add **dedupeKey** to finding ingestion and start grouping duplicates in UI.
4. Roll out **low-severity auto-approval** for 1–2 agents, measure noise rate before expanding.
