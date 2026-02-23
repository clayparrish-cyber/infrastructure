# Infrastructure Project Context

## What This Is

Registry-driven, multi-project agent infrastructure. Runs nightly via GitHub Actions, Supabase is the source of truth. Reviews 6+ codebases automatically for security, bugs, UX, content, polish, and performance issues.

## Architecture

```
.github/workflows/
└── nightly-review.yml          # 7-job pipeline (runs 2am CST daily)

agents/
├── registry.json               # Project + agent config (tiers, schedules, repos)
├── orchestrator/
│   └── decide-roster.md        # AI orchestrator prompt (builds nightly roster)
├── reviews/
│   └── {project}/              # Per-project review prompts (7 themes)
│       ├── security-review.md
│       ├── ux-layout-review.md
│       ├── bug-hunt-review.md
│       ├── content-value-review.md
│       ├── polish-brand-review.md
│       ├── performance-review.md
│       └── aso-retention-review.md
├── ops/
│   └── weekly-cleanup.md       # Sunday ops agent
├── workers/
│   └── work-loop-manager.sh    # Executes approved work items
└── lib/
    ├── collect-orchestrator-signals.ts
    ├── sync-to-supabase.ts
    └── git-activity-scanner.sh

packages/agent-learning/
└── src/
    ├── scoring/signal-score.ts
    └── learning/similarity.ts
```

## Nightly Pipeline (7 Jobs)

1. **setup** — Determines today's theme + tier from day-of-week
2. **clone-projects** — Clones relevant repos from registry
3. **orchestrator** — AI builds roster.json (falls back to static if it fails)
4. **reviews** — Runs `claude -p` for each roster entry sequentially
5. **sync** — Writes findings to Supabase `work_items` + `agent_runs_v2`
6. **workers** — Executes approved work items via `claude -p`
7. **reconcile** — Checks stale approved items, auto-closes resolved ones

## Weekly Schedule

| Day | Theme | Tier |
|-----|-------|------|
| Mon | security-review | 1 (in-market apps) |
| Tue | ux-layout-review | 1 |
| Wed | bug-hunt-review | 1 |
| Thu | content-value-review | 1 |
| Fri | polish-brand-review | 1 |
| Sat | Rotating (week % 5) | 2 (scaffolded projects) |
| Sun | weekly-cleanup + ops | 0 (all) |

## Project Tiers

- **Tier 1** (in-market): sidelineiq, airtip, dosie, glossy-sports, mainline-apps, mainline-dashboard
- **Tier 2** (scaffolded): gt-ops, menu-autopilot

## Agent Budgets (Updated 2026-02-23)

Total: ~$60/month. Top: worker $12, security/bug-hunt $7 each, ux-layout $6, orchestrator $5.

## Key Tables (Supabase)

| Table | Purpose |
|-------|---------|
| `agents` | Roster: id, name, tier (1-4), status, budget_monthly |
| `agent_runs_v2` | Run history: agent_id, project, status, cost, tokens |
| `work_items` | All findings: status flow discovered→triaged→approved→in_progress→review→done |
| `work_item_events` | Audit trail |
| `agent_budget_summary` | View: per-agent monthly cost vs budget |

## Secrets (GitHub Actions)

- `ANTHROPIC_API_KEY` — Powers all `claude -p` calls. **If credits run out, entire pipeline silently fails.** Set auto-reload at console.anthropic.com.
- `GH_PAT` — Clones private repos
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — Reads/writes findings
- `COMMAND_CENTER_URL` / `COMMAND_CENTER_API_KEY` — Posts to dashboard

## Known Gotchas

- **`claude -p` in while-read loops**: Must use fd 3 (`read -u 3`, `done 3<<<`) and `< /dev/null` to prevent stdin consumption. See skill: `claude-p-while-read-stdin-consumption`.
- **Static fallback**: If orchestrator AI fails, workflow falls back to naive static roster. Check `"source": "static-fallback"` in roster JSON.
- **Worker directory mismatch**: Workers look for projects at `projects/{name}` — monorepo subdirectories must be extracted correctly in clone step.
- **Budget view uses current month**: `agent_budget_summary` resets monthly. Runs from prior months don't count against current budget.

## Recent Changes

- **2026-02-23** — Fixed while-read loop bug: `claude -p` consumed stdin, causing reviews to process only 1 roster entry. Fixed with fd 3 + `< /dev/null`. Updated agent budgets to match actual usage ($38→$60/mo). Diagnosed 5-day outage caused by Anthropic API credit exhaustion.
- **2026-02-22** — Added ASO & retention review agents, fixed logs artifact download.
- **2026-02-20** — Added DRY_RUN input, strategic-portfolio-audit agent, business-synthesis agent.
- **2026-02-17** — Added business-synthesis agent for Sunday weekly briefings.
- **2026-02-16** — Fixed glossy-sports clone failure, added monorepo subdir support.
