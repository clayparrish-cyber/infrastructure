# Unified Agent System Design

**Date:** 2026-01-31
**Status:** Approved
**Author:** Clay + Claude (brainstorm session)

## Problem

Two disconnected agent systems exist:

1. **In-project scripts** (SidelineIQ `scripts/agents/content-validation.ts`) — structured task/recommendation/alert data model, per-item approve/reject, but only regex-based analysis and no scheduling.
2. **Nightly Claude reviews** (`~/.claude/agents/reviews/sidelineiq/`) — deep AI-powered analysis via `claude -p`, launchd scheduling, produces markdown reports and task lists. Only covers SidelineIQ, only 2 of 5 themes ever ran.

Neither system covers all projects, surfaces findings consistently, or closes the loop from finding to implementation.

## Goal

A unified agent system where:
- Agents run overnight across all projects on a predictable schedule
- Findings surface in a structured, actionable format
- Clay reviews and approves/rejects findings
- Approved findings get implemented in the next interactive session
- On-demand agents (research, marketing, legal) are invocable from any session
- Agent performance is tracked and evaluated

## Design Principles

- **Registry-driven:** All agents defined in one manifest. Add agent = add entry + prompt file.
- **Adaptive depth:** Start efficient, go deep when issues are found. Don't burn tokens on clean scans.
- **Structured output contract:** Every agent (scheduled or manual) writes the same JSON format. One interface, many sources.
- **Build for scale:** Architecture supports multi-project, multi-user, agent chaining. Current implementation is single-user.
- **Federated analysis:** Central brain agents handle quality/strategy. Project-specific agents (GT-Ops inventory) stay in-project. Dashboard aggregates both. No duplicate analysis.

## Project Tiers

| Tier | Projects | Review Frequency |
|------|----------|-----------------|
| 1 | SidelineIQ, AirTip, Dosie | All 5 themes weekly |
| 2 | GT-Ops, Menu Autopilot | 1 rotating theme weekly |

Tier promotion is a one-line change in the registry. GT-Ops graduates to Tier 1 around mid-Feb (inventory arrives ~2/13). Menu Autopilot graduates when MarginEdge recipe entry proves the platform.

Projects not in rotation: Scout (personal tool), REPS (sidelined).

## Schedule

```
Monday    — Security Review     → Tier 1 projects
Tuesday   — UX/Layout Review    → Tier 1 projects
Wednesday — Bug Hunt Review     → Tier 1 projects
Thursday  — Content/Value Review → Tier 1 projects
Friday    — Polish/Brand Review  → Tier 1 projects
Saturday  — Tier 2 Review       → GT-Ops, Menu Autopilot (rotating theme)
Sunday    — Internal Ops        → All projects (hygiene + agent evaluation)
```

Central brain agents (security, UX, bugs, content, polish) run for ALL projects in their tier, including GT-Ops when it's Tier 1. GT-Ops in-project agents (inventory, trends) are separate and not duplicated.

## Architecture

### File Structure

```
~/.claude/agents/
├── registry.json              # Master manifest of all agents
├── nightly-runner.sh          # Registry-aware scheduler (launchd)
├── reviews/                   # Nightly review prompts
│   ├── _templates/            # Base templates adapted per project
│   │   ├── security-review.md
│   │   ├── ux-layout-review.md
│   │   ├── bug-hunt-review.md
│   │   ├── content-value-review.md
│   │   └── polish-brand-review.md
│   ├── sidelineiq/            # Project-specific review prompts
│   ├── airtip/
│   ├── dosie/
│   ├── gt-ops/
│   └── menu-autopilot/
├── ops/                       # Internal ops prompts
│   └── weekly-cleanup.md
├── research/                  # On-demand research agents
│   ├── competitive-intel.md
│   ├── market-research.md
│   └── academic-researcher.md
├── specialists/               # Domain specialist agents
│   ├── legal-advisor.md
│   ├── marketing-analyst.md
│   └── business-analyst.md
└── personas/                  # Existing 15 research personas (keep as-is)
```

### Registry (`registry.json`)

```json
{
  "version": 1,
  "tiers": {
    "1": {
      "projects": ["sidelineiq", "airtip", "dosie"],
      "description": "In-market or ready for users"
    },
    "2": {
      "projects": ["gt-ops", "menu-autopilot"],
      "description": "Scaffolded, waiting on dependencies"
    }
  },
  "projects": {
    "sidelineiq": {
      "path": "/Volumes/Lexar/Projects/Personal/SidelineIQ/sideline-iq",
      "contextFile": "CLAUDE_CONTEXT.md",
      "owner": "clay",
      "stack": "expo/react-native"
    },
    "airtip": {
      "path": "~/Projects/Apolis/menu-autopilot",
      "contextFile": "CLAUDE.md",
      "owner": "clay",
      "stack": "next.js",
      "note": "AirTip lives at /tips within menu-autopilot"
    },
    "dosie": {
      "path": "~/Projects/Personal/Dosie/web",
      "contextFile": "CLAUDE.md",
      "owner": "clay",
      "stack": "next.js/supabase"
    },
    "gt-ops": {
      "path": "~/Projects/Gallant Tiger/gt-ops",
      "contextFile": "CLAUDE.md",
      "owner": "shared",
      "stack": "next.js/neon",
      "note": "Has in-project agents for inventory/trends. Central agents still run here."
    },
    "menu-autopilot": {
      "path": "~/Projects/Apolis/menu-autopilot",
      "contextFile": "CLAUDE.md",
      "owner": "shared",
      "stack": "next.js"
    }
  },
  "agents": [
    {
      "id": "security-review",
      "name": "Security Review",
      "category": "review",
      "promptTemplate": "reviews/_templates/security-review.md",
      "schedule": { "day": "monday", "tiers": [1] },
      "maxTurns": 50,
      "depth": "adaptive",
      "description": "OWASP top 10, secrets scanning, auth checks, input validation"
    },
    {
      "id": "ux-layout-review",
      "name": "UX & Layout Review",
      "category": "review",
      "promptTemplate": "reviews/_templates/ux-layout-review.md",
      "schedule": { "day": "tuesday", "tiers": [1] },
      "maxTurns": 50,
      "depth": "adaptive",
      "description": "Accessibility, responsive design, user flow, visual consistency"
    },
    {
      "id": "bug-hunt-review",
      "name": "Bug Hunt Review",
      "category": "review",
      "promptTemplate": "reviews/_templates/bug-hunt-review.md",
      "schedule": { "day": "wednesday", "tiers": [1] },
      "maxTurns": 50,
      "depth": "adaptive",
      "description": "Edge cases, error handling, race conditions, data integrity"
    },
    {
      "id": "content-value-review",
      "name": "Content & Value Review",
      "category": "review",
      "promptTemplate": "reviews/_templates/content-value-review.md",
      "schedule": { "day": "thursday", "tiers": [1] },
      "maxTurns": 50,
      "depth": "adaptive",
      "description": "Content quality, value proposition, user-facing copy, feature completeness"
    },
    {
      "id": "polish-brand-review",
      "name": "Polish & Brand Review",
      "category": "review",
      "promptTemplate": "reviews/_templates/polish-brand-review.md",
      "schedule": { "day": "friday", "tiers": [1] },
      "maxTurns": 50,
      "depth": "adaptive",
      "description": "Brand consistency, visual polish, micro-interactions, attention to detail"
    },
    {
      "id": "tier2-rotating-review",
      "name": "Tier 2 Rotating Review",
      "category": "review",
      "schedule": { "day": "saturday", "tiers": [2] },
      "maxTurns": 50,
      "depth": "adaptive",
      "rotates": ["security-review", "ux-layout-review", "bug-hunt-review", "content-value-review", "polish-brand-review"],
      "description": "Cycles through review themes for Tier 2 projects each week"
    },
    {
      "id": "weekly-cleanup",
      "name": "Internal Ops & Agent Evaluation",
      "category": "ops",
      "prompt": "ops/weekly-cleanup.md",
      "schedule": { "day": "sunday", "tiers": [1, 2] },
      "maxTurns": 30,
      "description": "Folder hygiene, CLAUDE.md sync, task list dedup, agent performance eval"
    },
    {
      "id": "competitive-intel",
      "name": "Competitive Intelligence",
      "category": "research",
      "prompt": "research/competitive-intel.md",
      "schedule": null,
      "maxTurns": 80,
      "suggestedCadence": "biweekly",
      "description": "Competitor analysis, market positioning, industry trends"
    },
    {
      "id": "marketing-analyst",
      "name": "Marketing Analysis",
      "category": "specialist",
      "prompt": "specialists/marketing-analyst.md",
      "schedule": null,
      "maxTurns": 60,
      "description": "Campaign performance, attribution, content strategy"
    },
    {
      "id": "legal-advisor",
      "name": "Legal Review",
      "category": "specialist",
      "prompt": "specialists/legal-advisor.md",
      "schedule": null,
      "maxTurns": 40,
      "description": "Privacy policies, terms of service, compliance review"
    },
    {
      "id": "business-analyst",
      "name": "Business Analysis",
      "category": "specialist",
      "prompt": "specialists/business-analyst.md",
      "schedule": null,
      "maxTurns": 60,
      "description": "KPIs, revenue analysis, growth projections, cohort analysis"
    }
  ]
}
```

### Output Contract

Every agent writes two files per run:

**Human-readable report** (`YYYY-MM-DD-{agent-id}.md`):
```markdown
# Security Review — SidelineIQ
**Date:** 2026-02-03
**Agent:** security-review
**Turns used:** 18/50
**Duration:** 45s

## Summary
Found 3 issues: 1 high, 2 medium.

## Findings
### [HIGH] Exposed API key in client-side bundle
...
```

**Structured findings** (`YYYY-MM-DD-{agent-id}.json`):
```json
{
  "meta": {
    "agent": "security-review",
    "project": "sidelineiq",
    "date": "2026-02-03",
    "turns": 18,
    "maxTurns": 50,
    "durationMs": 45000,
    "status": "completed"
  },
  "findings": [
    {
      "id": "f-uuid-1",
      "severity": "high",
      "title": "Exposed API key in client-side bundle",
      "description": "ANTHROPIC_API_KEY is referenced in a client component...",
      "files": ["src/components/AnalysisButton.tsx:14"],
      "suggestedFix": "Move API call to server action or API route",
      "effort": "S",
      "status": "pending"
    }
  ],
  "summary": {
    "total": 3,
    "high": 1,
    "medium": 2,
    "low": 0
  }
}
```

**Output locations:**
```
~/Projects/agent-reports/
├── sidelineiq/
│   ├── 2026-02-03-security-review.md
│   ├── 2026-02-03-security-review.json
│   └── ...
├── airtip/
├── dosie/
├── gt-ops/
├── menu-autopilot/
└── _meta/
    └── run-log.json
```

### Run Log (`_meta/run-log.json`)

Tracks operational health across all runs:
```json
{
  "runs": [
    {
      "date": "2026-02-03",
      "agent": "security-review",
      "project": "sidelineiq",
      "status": "completed",
      "turns": 18,
      "findings": 3,
      "findingsBreakdown": { "high": 1, "medium": 2, "low": 0 },
      "durationMs": 45000
    }
  ]
}
```

The Sunday ops agent reads this to produce: "All scheduled reviews ran this week. Average 16 turns per review. SidelineIQ generated the most findings (12). GT-Ops security review was skipped (not Tier 1 this week)."

### Nightly Runner

Updated `nightly-runner.sh` reads from registry:

1. Determine day of week
2. Read `registry.json` → find agents scheduled for today
3. For each agent, resolve which projects to review (by tier)
4. For each project, check path exists (handles Lexar mount, etc.)
5. Run `claude -p` with the agent's prompt, passing project path and context file as arguments
6. Append to `run-log.json`
7. Sequential execution (one project at a time) to control token burn

**Token budget awareness:** The runner checks `run-log.json` to see how many sessions have run this week. If approaching a configurable weekly cap, it logs a warning and skips lower-priority runs. This prevents Monday's reviews from eating all tokens before Friday.

### Session Start Menu

Updated `check-agent-reports` skill (or new `agent-menu` skill):

```
═══════════════════════════════════════
  Agent Command Center
═══════════════════════════════════════

Overnight Results
  Security Review — 4 findings (2 High, 2 Med)   SidelineIQ, AirTip, Dosie
  Last run: 2026-02-03 02:14 AM — 18 turns

Pending Decisions
  11 findings across 3 reviews awaiting your input

Available Actions
  [1] Review pending findings (11 items)
  [2] Run competitive intel        (last: 2 weeks ago)
  [3] Run marketing analysis       (last: never)
  [4] Run legal review             (last: never)
  [5] Custom agent chain
  [6] Work on something else

What would you like to do?
```

When Clay picks [1], findings are presented with approve/reject/defer per item. Approved items are written to a task list that the current session (or next session) implements.

When Clay picks [2-4], the on-demand agent runs within the current session.

When Clay picks [5], Clay describes the chain: "Run competitive intel on SidelineIQ, then marketing analysis on the results." Agents run sequentially, each reading the previous agent's output.

When Clay picks [6], normal Claude session proceeds.

### Agent Chaining (future-ready)

Not built in Phase 1, but the registry supports it:

```json
{
  "id": "market-strategy-chain",
  "name": "Market Strategy Pipeline",
  "category": "chain",
  "steps": [
    { "agent": "competitive-intel", "passOutputTo": "next" },
    { "agent": "marketing-analyst", "passOutputTo": "next" },
    { "agent": "legal-advisor" }
  ]
}
```

Each step's structured JSON output becomes context for the next step. Collaboration tracking: the run log records which agents participated in a chain and the chain's overall outcome.

### Sunday Ops Agent

Responsibilities:
1. **Folder hygiene:** Check each project for stale files, orphaned branches, inconsistent structure
2. **CLAUDE.md sync:** Verify each project's context file reflects current state (recent changes section, env vars, etc.)
3. **Task list dedup:** Ensure no duplicate task lists exist per project, merge if found
4. **Agent evaluation:**
   - Quality: Are findings actionable? (check approved vs. rejected ratio from decision log)
   - Reliability: Did all scheduled runs complete? Any failures?
   - Impact: Of approved findings that were implemented, did they stick? (check if the same issue resurfaces)
5. **Weekly summary:** Human-readable digest of the week's agent activity

### GT-Ops Integration

GT-Ops has in-project agents (inventory, trends) that stay in `~/Projects/Gallant Tiger/gt-ops/`. Central brain agents (security, UX, etc.) also run on GT-Ops when it's in their tier.

**No duplicate analysis.** If the central security agent reviews GT-Ops auth, and the in-project inventory agent analyzes stock levels, those are different domains. The dashboard aggregates both:
- Central agent findings: read from `~/Projects/agent-reports/gt-ops/`
- In-project agent findings: read from `~/Projects/Gallant Tiger/gt-ops/agent-reports/` (or similar)

Both use the same structured JSON format.

## Implementation Phases

### Phase 1: Foundation (current session)
- [ ] Create `registry.json` with all agent definitions
- [ ] Write updated `nightly-runner.sh` (registry-aware, sequential, path-checking)
- [ ] Create review prompt templates for AirTip and Dosie
- [ ] Create Sunday ops agent prompt
- [ ] Define structured JSON output format (template in each prompt)
- [ ] Update `check-agent-reports` skill to read registry and show session-start menu
- [ ] Update launchd plist for 7-day schedule
- [ ] Test: manual run of one agent on one project to verify output format

### Phase 2: Dashboard v1 (next session)
- [ ] Simple Next.js page (standalone or route in existing project)
- [ ] Reads agent-reports JSON files
- [ ] Findings feed: all pending findings, filterable by project/severity/agent
- [ ] Approve/reject/defer per finding
- [ ] Approved items written as structured task lists
- [ ] Project status cards: last scan, pending findings count, recent activity
- [ ] Deploy to Vercel

### Phase 3: Pipeline Hardening (after 1-2 weeks of data)
- [ ] Agent chaining support in runner
- [ ] GT-Ops in-project agent integration (read-only aggregation)
- [ ] Agent evaluation metrics (quality, reliability, impact)
- [ ] Dashboard v2: project progress tracker, AI-estimated timelines, decision log
- [ ] Token budget monitoring and weekly cap enforcement
- [ ] Cadence reminders for unscheduled agents (e.g., "competitive intel hasn't run in 3 weeks")

### Phase 4: Operations Brain (when data accumulates)
- [ ] Dashboard v3: cross-project intelligence, week-over-week trends
- [ ] Auto-triggering chains based on finding severity
- [ ] Agent collaboration tracking and performance comparison
- [ ] Project roadmap view with dependencies, blockers, owners
- [ ] Human task flagging (MarginEdge recipes, etc.) vs. agent-estimable work

## Token Budget

**Current plan:** $100/month Claude Max
**Potential upgrade:** $200/month

**Estimated weekly usage (Phase 1):**
- Tier 1: 5 nights x 3 projects = 15 sessions, ~20 turns avg = ~300 turns/week
- Tier 2: 1 night x 2 projects = 2 sessions, ~20 turns avg = ~40 turns/week
- Sunday ops: 1 session x ~30 turns = 30 turns/week
- **Total scheduled: ~370 turns/week**
- Interactive daily use: ~200-400 turns/day = 1000-2000 turns/week
- **Nightly agents are ~15-25% of total capacity**

Configurable weekly cap in runner prevents runaway token consumption. If a review night gets skipped due to cap, it's logged and the Sunday ops agent flags it.

## Migration from Existing Systems

### System 1 (content-validation.ts)
- **Keep:** Structured data model concept (tasks, recommendations, alerts), per-item approve/reject
- **Migrate:** Output format becomes the standard JSON contract
- **Retire:** The script itself — its analysis is now handled by the content-value nightly review which does much deeper work

### System 2 (nightly reviews)
- **Keep:** Claude-powered analysis, launchd scheduling, themed review prompts
- **Migrate:** SidelineIQ prompts move to `reviews/sidelineiq/`, runner becomes registry-aware
- **Upgrade:** Structured JSON output alongside markdown, multi-project support

### Codex PR #2 changes
- **Keep:** Configurable paths (env var pattern), resilient initialization, duration tracking
- **Incorporate:** These patterns inform the runner and output contract design
