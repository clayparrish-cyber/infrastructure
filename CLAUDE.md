# Infrastructure Project Context

## What This Is

Registry-driven, multi-project agent infrastructure. Runs nightly via GitHub Actions, Supabase is the source of truth. Reviews 6+ codebases automatically for security, bugs, UX, content, polish, and performance issues.

## Architecture

```
.github/workflows/
└── nightly-review.yml          # 7-job pipeline (runs 2am CST daily)

agents/
├── registry.json               # Project + agent config (22 agents, automation profiles, schedules)
├── config/
│   └── credentials.json        # Token/key registry with expiry dates
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

1. **setup** — Determines today's theme + project scope from day-of-week
2. **clone-projects** — Clones relevant repos from registry
3. **orchestrator** — AI builds roster.json (falls back to static if it fails)
4. **reviews** — Runs `claude -p` for each roster entry sequentially
5. **sync** — Writes findings to Supabase `work_items` + `agent_runs_v2`
6. **workers** — Executes approved work items via `claude -p`
7. **reconcile** — Checks stale approved items, auto-closes resolved ones

## Weekly Schedule

| Day | Theme | Scope |
|-----|-------|------|
| Mon | security-review | core |
| Tue | ux-layout-review | core |
| Wed | bug-hunt-review | core |
| Thu | content-value-review | core |
| Fri | polish-brand-review | core |
| Sat | Rotating (week % 5) + performance (even) | all |
| Sun | weekly-cleanup + ops | all |

## Automation Profiles

- **Core**: sidelineiq, airtip, dosie, glossy-sports, mainline-apps, mainline-dashboard
- **Scaffolded**: gt-ops, menu-autopilot, the-immortal-snail, gt-website
- **Ops-only**: infrastructure

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

- **2026-03-17** — Wired ops-deploy and ops-communications categories into agent pipeline. AGENT_CATEGORY_OVERRIDE map in sync-to-supabase.ts routes health-check→ops-deploy, chief-of-staff→ops-communications. Finding-level decision_category override supported. Review prompts updated with decision_category in direct curl inserts.
- **2026-03-17** — Agent registry fix: reactivated marketing-analyst/legal-advisor/business-analyst in Supabase. Registered gt-website (scaffolded). Fixed Saturday clone scope (scaffolded->all) so performance-review runs on core projects. Fixed strategic-portfolio-audit working dir. Added skip logging to run_meta_agent. Added the-immortal-snail + gt-website to tier2-rotating and performance-review projects.
- **2026-03-14** — Added `content-autonomy.ts` module: L1-L4 agent promotion tiers for content pipeline. Wired into sync-to-supabase for content-writer agents. CLI diagnostic mode included.
- **2026-03-10** — Added `core-lite` automation profile for GT. security-review (Mon/Fri) + content-value-review (Thu) + weekly-cleanup (Sun) now cover core-lite projects. Workflow filtering updated.
- **2026-03-02** — Automated loop closure: workers push branches, create PRs via gh CLI, L3+ auto-merge. PR reconcile step in nightly workflow marks merged items as done.

## Current Status (2026-01-23)

**Completed:**
- [x] 15 Phase 1 agents installed
- [x] inventory-health.ts and monday-briefing.ts verified working
- [x] GT-IMS Command Center deployed (gt-ops.vercel.app/command-center)
- [x] Executive Dashboard design document written
- [x] **Agent Learning Loop Closed** (Ralph mission completed):
  - Signal scores calculated on human decisions (60% decision, 20% recency, 20% priority)
  - Similarity query finds past recommendations before generating new ones
  - Few-shot examples formatted and included in recommendation reasoning
  - 7-day deduplication prevents duplicate recommendations
  - All 32 unit tests pass

**Next Steps:**
- [ ] Build Executive Dashboard MVP (Priority 2)
- [x] **Add prime directives to agents** (Priority 3) - ✅ COMPLETED 2026-01-23
- [ ] Fix hardcoded demand value in inventory-health.ts (Priority 4)
- [ ] Create legal-review.ts, research-request.ts, db-optimization.ts agent scripts

### @clayparrish/agent-learning Package

Shared npm package for agent learning capabilities:

```
packages/agent-learning/
├── src/
│   ├── scoring/signal-score.ts      # calculateSignalScore()
│   ├── learning/
│   │   ├── similarity.ts            # findSimilarRecommendations()
│   │   └── few-shot.ts              # formatExamplesForPrompt()
│   ├── embeddings/generate.ts       # generateEmbedding()
│   ├── directives/
│   │   ├── types.ts                 # Directive, DirectiveContext, Violation
│   │   └── check.ts                 # checkDirectives(), formatViolations()
│   └── db/connection.ts             # Database connection helpers
└── dist/                            # Compiled output (use this for imports)
```

### Agent Prime Directives (Added 2026-01-23)

Guardrails that prevent agent drift by flagging violations for human review:

**Config:** `config/agents/prime-directives.ts`

**Universal Directives (all agents):**
- `cite-source` - Must cite data source for every recommendation
- `flag-uncertainty` - Flag when confidence < 80%
- `human-reasoning` - Include human-readable reasoning (>20 chars)

**Agent-Specific Directives:**
- INVENTORY: `fresh-data` (data < 7 days), `realistic-demand` (CRM-based)
- LEGAL: `no-advice` (flag only, never provide legal advice)
- RESEARCH: `cite-sources` (must include URLs)

**Enforcement:** Soft - violations set `needsVerification=true` and populate `violationReason` for Command Center review.

**Usage in venture projects:**
```json
// package.json
"dependencies": {
  "@clayparrish/agent-learning": "file:../../infrastructure/packages/agent-learning"
}
```

**Note:** Next.js 16 requires webpack config for `file:` linked packages. See skill: `nextjs-exclude-scripts-from-build`

## Development

```bash
cd /Volumes/Lexar/Projects/infrastructure

# Agent configs
cat config/agents/phase-1-config.ts

# View design docs
ls docs/plans/
```

## Related Projects

| Project | Path | Relationship |
|---------|------|--------------|
| GT-Ops | /Volumes/Lexar/Projects/Gallant Tiger/gt-ops | Primary test bed, has working agents |
| Menu Autopilot | /Volumes/Lexar/Projects/Apolis/menu-autopilot | Future agent integration |
| AirTip | /Volumes/Lexar/Projects/Apolis/menu-autopilot (at /tips) | Future agent integration |
| SidelineIQ | /Volumes/Lexar/Projects/Personal/SidelineIQ/sideline-iq | Future agent integration |
| Dosie | /Volumes/Lexar/Projects/Personal/Dosie/web | Future agent integration |


## Org Documentation Governance (3-Tier)
<!-- ORG_DOCS_3_TIER_POLICY -->

For non-trivial tasks, persist context to Markdown before finishing. Do not leave critical context only in chat.

Use one tier per note:
1. `canonical`: long-lived source of truth; requires `owner` and recurring `review_by`; `expires_at` should be `none`.
2. `operational`: medium-lived project context; requires both `review_by` and `expires_at`; default TTL 30 days.
3. `ephemeral`: short-lived scratch context; requires both `review_by` and `expires_at`; default TTL 7 days.

Required front matter on governed notes:

```md
---
type: canonical|operational|ephemeral
owner: <team-or-person>
created_at: YYYY-MM-DD
review_by: YYYY-MM-DD
expires_at: YYYY-MM-DD|none
source_of_truth: <canonical file/link/ticket>
status: active|superseded|expired
---
```

Preferred path: `docs/knowledge/{canonical|operational|ephemeral}`.
Archive stale/superseded notes to `docs/knowledge/archive` and update `status`.

Run `/Volumes/Lexar/Projects/scripts/check-stale-docs.sh` before major handoffs.
