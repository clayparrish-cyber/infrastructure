# Agent & Automation Plans

> Central planning doc for AI/automation across projects.
> Last updated: 2026-01-20

---

## Philosophy

**Deterministic first, agents when rules hit limits.**

Agents add value when:
- Patterns emerge that rules can't explain
- Manual decisions become bottlenecks
- Context-dependent reasoning is needed
- Multi-factor trade-offs require weighing

Don't build agents to do what `if/else` does better.

---

## Project Overview

| Project | Stage | Agent Readiness | Primary Automation Opportunity |
|---------|-------|-----------------|-------------------------------|
| **Menu Autopilot** | Phase 1 (data pipeline) | 🟡 Not yet | Menu engineering skills, report generation |
| **AirTip** | MVP, active users | 🟡 Not yet | OCR validation, tip calculation skills |
| **SidelineIQ** | Pre-launch MVP | 🔴 N/A | Content generation (future), no runtime agents |
| **GT-IMS** | Phase 1 (config) | 🟢 Architecture ready | Demand forecasting, reorder agents (Phase 4) |

---

## Menu Autopilot

**What it is:** SaaS for restaurant menu engineering - analyzes item performance, recommends optimizations.

**Current state:** Toast API integration complete. Wiring sync data to reports flow. Awaiting recipe standardization.

### Blockers Before Agent Work
- [ ] Recipe table + ingredient naming convention
- [ ] 4+ weeks of real data flowing through system
- [ ] Deterministic logic validated against outcomes

### Skill Opportunities (Build Now)

| Skill | Purpose | Trigger |
|-------|---------|---------|
| `menu-analysis` | Run menu engineering matrix (stars/puzzles/plowhorses/dogs), generate recommendations | "analyze menu", "run menu engineering", "which items should we cut" |
| `cost-validation` | Compare Toast cost vs MarginEdge cost, flag discrepancies | "validate costs", "cost reconciliation", "why don't margins match" |
| `report-generation` | Generate weekly performance reports with standard format | "generate report", "weekly summary", "performance report" |

### Agent Opportunities (Build Later - Phase 3+)

| Agent | Input | Output | Trigger Condition |
|-------|-------|--------|-------------------|
| **Menu Optimization Agent** | Item performance data, costs, constraints | Ranked recommendations with reasoning | "When rules can't explain why an item underperforms" |
| **Price Elasticity Agent** | Historical price changes, sales impact | Price change recommendations with confidence | "When considering price increases" |
| **What-If Agent** | Proposed menu changes | Impact simulation | "What happens if we remove X" |

### Data Dependencies
```
Toast sync ──► items table ──► reports ──► recommendations
     │              │
     └──► recipes table (needed)
              │
              └──► cost calculation
```

---

## AirTip

**What it is:** Sub-app within Menu Autopilot for tip management - OCR scans, pay period tracking, tip-out calculations.

**Current state:** MVP with active users (Kamal @ Stepchld). Core flow works. Needs guardrails and polish.

### Blockers Before Agent Work
- [ ] Bad scan guardrails (high priority)
- [ ] Unmatched staff handling
- [ ] Finalize summary screen

### Skill Opportunities (Build Now)

| Skill | Purpose | Trigger |
|-------|---------|---------|
| `tip-calculation` | Standard tip-out formulas, compliance rules, pooling calculations | "calculate tip-outs", "split tips", "tip pool" |
| `ocr-validation` | Confidence scoring for OCR extractions, flag low-confidence fields | "scan quality", "OCR failed", "can't read scan" |
| `payroll-export` | Format tip data for Toast/payroll system export | "export tips", "payroll format", "Toast export" |

### Agent Opportunities (Probably Never)

AirTip is fundamentally deterministic - tip calculations have right answers based on rules. Agents add little value here.

**Exception:** If we add "tip compliance advisor" that interprets labor laws by jurisdiction, that could benefit from reasoning. Low priority.

### Integration Points
- Toast Labor API (employees, time entries) - already integrated
- Payroll export formats (future)

---

## SidelineIQ

**What it is:** "Duolingo for Sports" - gamified learning app for adults learning football rules/strategy.

**Current state:** Feature-complete MVP, polished UI. Awaiting Apple Developer approval.

### Blockers Before Any AI Work
- [ ] App Store approval
- [ ] Real user data (engagement patterns)

### Skill Opportunities (Build Now - For Development)

| Skill | Purpose | Trigger |
|-------|---------|---------|
| `lesson-authoring` | Standard format for creating new lessons, exercise types, content structure | "create lesson", "add exercise", "new content" |
| `content-validation` | Check lesson structure, difficulty progression, coverage gaps | "validate lessons", "check content", "difficulty review" |

### Agent Opportunities (Build Later - Content Expansion)

| Agent | Input | Output | When |
|-------|-------|--------|------|
| **Content Generation Agent** | Topic + difficulty level + exercise type | Draft lesson content | When expanding to new sports |
| **Difficulty Calibration Agent** | User performance data | Adjusted difficulty ratings | When we have 1000+ users |
| **Personalization Agent** | User learning patterns | Custom lesson sequences | Premium feature, far future |

### Not Applicable
- No runtime agents in the app itself
- Gamification is rule-based (XP, streaks, achievements)
- Agent value is in content creation pipeline, not user experience

---

## GT-IMS

**What it is:** Internal inventory management for Gallant Tiger (frozen CPG). SKU tracking, PO generation, reorder recommendations.

**Current state:** MVP data layer complete. Reorder algorithm implemented + tested. Awaiting real data from distributor.

### Blockers Before Agent Work
- [ ] Run SKU Business Rules migration
- [ ] Distributor API integration (spec needed)
- [ ] 8-12 weeks of demand history

### Skill Opportunities (Build Now)

| Skill | Purpose | Trigger |
|-------|---------|---------|
| `reorder-analysis` | Explain reorder recommendation calculation, show trade-offs | "why reorder", "explain recommendation", "reorder details" |
| `inventory-health` | Assess inventory position across SKUs, flag concerns | "inventory status", "health check", "stockout risk" |
| `po-generation` | Standard PO creation workflow with validation | "create PO", "new purchase order" |

### Agent Opportunities (Build Phase 4 - 8-12 Weeks)

**This is the most agent-ready project.** Architecture designed with agents in mind.

| Agent | Input | Output | Interaction Model |
|-------|-------|--------|-------------------|
| **Demand Forecasting Agent** | Historical demand, seasonality signals, external factors | Forecast with confidence intervals | Weekly batch, stores to `BaseItemDemandForecast` |
| **Inventory Optimization Agent** | Current inventory, forecast, business rules | Reorder recommendation with reasoning | On-demand, triggered by dashboard |
| **Supplier Selection Agent** | Order qty, vendor options, performance history | Vendor recommendation with rationale | When creating PO |
| **PO Generation Agent** | Approved recommendation | Complete draft PO | After human approves recommendation |

### Agent Architecture (Already Designed)

```
┌─────────────────────────────────────────────────────────────┐
│                     Human Approval Layer                     │
│   (All agent recommendations require explicit approval)      │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │
┌─────────────────────────────────────────────────────────────┐
│                      Agent Layer                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   Demand     │  │  Inventory   │  │   Supplier   │       │
│  │  Forecast    │──│ Optimization │──│  Selection   │       │
│  │    Agent     │  │    Agent     │  │    Agent     │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │
┌─────────────────────────────────────────────────────────────┐
│                  Deterministic Rules Layer                   │
│   (SKU Business Rules, Safety Stock, MOQ, Lead Times)       │
│   Rules are AUTHORITATIVE - agents can suggest overrides    │
│   but cannot bypass rules without human approval            │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │
┌─────────────────────────────────────────────────────────────┐
│                       Data Layer                             │
│  Inventory Snapshots │ Demand Signals │ PO History │ Events │
└─────────────────────────────────────────────────────────────┘
```

### Agent Trigger Conditions
- **Demand Forecast:** Weekly cron, or when historical data updated
- **Inventory Optimization:** When any SKU crosses safety threshold
- **Supplier Selection:** When creating PO with >$5K value
- **PO Generation:** After recommendation approval

### Override Tracking
```prisma
model AgentRecommendation {
  id              String   @id
  agentType       String   // demand_forecast | inventory_opt | supplier_select
  recommendation  Json     // The agent's output
  reasoning       String   // Agent's explanation
  humanDecision   String?  // approved | rejected | modified
  humanReasoning  String?  // Why they overrode
  appliedAt       DateTime?
  createdAt       DateTime @default(now())
}
```

### Marketplace Skills to Revisit (Phase 4)

- [ ] Evaluate `intent-solutions-io/plugins-nixtla` for Demand Forecasting Agent
  - Relevant skills: `nixtla-batch-forecaster`, `nixtla-forecast-validator`, `nixtla-model-selector`, `nixtla-exogenous-integrator`
  - Requires: `NIXTLA_TIMEGPT_API_KEY` (paid) or self-hosted
  - Repo: https://github.com/intent-solutions-io/plugins-nixtla
  - Revisit when: 8-12 weeks of sales data available

---

## Cross-Project Skills

Skills that could be shared across projects:

| Skill | Projects | Purpose |
|-------|----------|---------|
| `data-validation` | All | Standard data quality checks, flag anomalies |
| `api-health` | Menu Autopilot, GT-IMS | Check external API connections, diagnose issues |
| `report-formatting` | Menu Autopilot, GT-IMS | Consistent report generation templates |

---

## Implementation Priority

### Now (Development Skills)
1. **GT-IMS:** `reorder-analysis`, `inventory-health` - immediate value for understanding system
2. **AirTip:** `ocr-validation` - addresses current user pain point
3. **Menu Autopilot:** `menu-analysis` - core value prop

### After Data Flows (4-6 Weeks)
1. **GT-IMS:** Run business rules migration, validate deterministic logic
2. **Menu Autopilot:** Validate cost calculation accuracy

### When Rules Hit Limits (8-12 Weeks)
1. **GT-IMS:** Demand Forecasting Agent
2. **GT-IMS:** Inventory Optimization Agent
3. **Menu Autopilot:** Menu Optimization Agent (if needed)

### Far Future
1. **SidelineIQ:** Content Generation Agent (new sports expansion)
2. **GT-IMS:** Supplier Selection Agent (when multiple vendors active)

---

## Questions to Resolve

| Question | Project | Impact |
|----------|---------|--------|
| Distributor API spec? | GT-IMS | Blocks Phase 2 data integration |
| KFF update feed format? | GT-IMS | Blocks lead time tracking |
| Recipe naming convention? | Menu Autopilot | Blocks cost accuracy |
| Multi-location architecture? | Menu Autopilot | Affects skill design |

---

## Agent Interaction Layer (2026-01-20)

**Design Doc:** `~/Projects/docs/plans/2026-01-20-agent-interaction-layer-design.md`

### Completed (Phase 1 + 2 + 3)

| Item | Status | Notes |
|------|--------|-------|
| GT-IMS agent tables | ✅ Done | AgentTask, AgentRecommendation, AgentAlert, AgentKnowledge |
| GT-IMS Command Center | ✅ Done | `/command-center` with approvals, alerts, activity log |
| `/gt-inventory-health` skill | ✅ Done | Script + skill file in `.claude/commands/` |
| `/gt-monday-briefing` skill | ✅ Done | Script + skill file in `.claude/commands/` |
| Menu Autopilot agent tables | ✅ Done | Same schema pattern adapted for Menu Autopilot agent types |
| Menu Autopilot `/agents` page | ✅ Done | Dashboard with pending approvals, alerts, activity |
| AirTip `/tips/admin/agents` page | ✅ Done | Agents card in admin + full agents dashboard |
| `/menu-weekly-report` skill | ✅ Done | Script + skill file in `.claude/commands/` |
| `/airtip-ocr-review` skill | ✅ Done | Script + skill file in `.claude/commands/` |
| Local HTML dashboard for solo projects | ✅ Done | `~/Projects/agent-dashboard/index.html` - unified view grouped by project |
| JSON storage for local agent state | ✅ Done | `~/Projects/agent-dashboard/scripts/agent-store.ts` - TypeScript library |
| `/sidelineiq-content-validation` skill | ✅ Done | Validates lesson content, exercise distribution, icons |
| `/dosie-competitive-research` skill | ✅ Done | Analyzes competitive landscape, positioning opportunities |

### Remaining (Future)

| Item | Phase | Priority |
|------|-------|----------|
| `/gt-research` skill | 1B-5 | Can skip for now - web research is complex |
| Routing logic (assign to Charlie/Kamal/Clay) | 1B-6 | Nice to have |

### How to Test What's Built

```bash
# GT-IMS - Run inventory health check
cd ~/Projects/Internal\ Systems/gt-ims
npx tsx scripts/agents/inventory-health.ts

# GT-IMS - Run Monday briefing
npx tsx scripts/agents/monday-briefing.ts

# View results at: gt-ims.vercel.app/command-center

# Menu Autopilot - Run weekly menu report
cd ~/Projects/menu-autopilot
npx tsx scripts/agents/menu-weekly-report.ts

# View results at: menu-autopilot.vercel.app/agents

# AirTip - Run OCR review
cd ~/Projects/menu-autopilot
npx tsx scripts/agents/airtip-ocr-review.ts

# View results at: airtipapp.com/tips/admin/agents

# SidelineIQ - Run content validation
cd ~/Projects/SidelineIQ/sideline-iq
npx tsx scripts/agents/content-validation.ts

# Dosie - Run competitive research
cd ~/Projects/Dosie
npx tsx scripts/agents/competitive-research.ts

# View solo project results at:
open ~/Projects/agent-dashboard/index.html
```

---

## Next Steps

1. **GT-IMS:** Run business rules migration, then build `reorder-analysis` skill
2. **Menu Autopilot:** Finalize recipe table, wire Toast data
3. **SidelineIQ:** Wait for App Store approval, then gather engagement data
4. **Dosie:** Continue MVP development, run research skill before App Store listing
