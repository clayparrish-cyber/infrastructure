# Agent Interaction Layer Design

> Cross-project agent management system for GT-IMS, Menu Autopilot, AirTip, SidelineIQ, and Dosie.
>
> Created: 2026-01-20
> Status: Approved for implementation

---

## Overview

Build an "AI operating system" where agents execute work and humans (Clay, Charlie, Kamal) act as executives who approve and delegate. The goal is minimal time in execution weeds, with agents doing the heavy lifting.

### Stakeholders

| Person | Role | Projects | Approves |
|--------|------|----------|----------|
| **Kamal** | CEO | GT, Menu Autopilot, AirTip | Brand, product, flavor decisions |
| **Charlie** | COO | GT, Menu Autopilot, AirTip | Operations, most agent recommendations |
| **Clay** | CGO | All projects | Tech decisions, agent architecture |

### Projects

| Project | Stakeholders | Agent Interface |
|---------|--------------|-----------------|
| **GT-IMS** | Clay, Charlie, Kamal | GT-IMS `/command-center` |
| **Menu Autopilot** | Clay, Charlie, Kamal | Menu Autopilot `/agents` |
| **AirTip** | Clay, Charlie, Kamal | Menu Autopilot `/tips/agents` |
| **SidelineIQ** | Clay only | Local HTML dashboard |
| **Dosie** | Clay only | Local HTML dashboard (minimal) |

---

## Architecture

### Three-Layer Model

```
┌─────────────────────────────────────────────────────────────┐
│                    HUMAN LAYER                               │
│  Command Center dashboards - Alerts, Approvals, Queries     │
│  Kamal, Charlie, Clay approve recommendations               │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │ writes recommendations
                              │ humans approve/reject
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    AGENT LAYER                               │
│  Briefing │ Operational │ Research │ Development            │
│  Agents execute tasks, never take irreversible actions      │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │ reads context
                              │ stores learnings
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   KNOWLEDGE LAYER                            │
│  Persistent memory - earnings, trends, past decisions       │
│  Agents accumulate intelligence, surface only what matters  │
└─────────────────────────────────────────────────────────────┘
```

### Agent Types by Project

**GT-IMS:**
- GT Inventory Agent - monitors stock, recommends reorders
- GT Briefing Agent - compiles Monday recaps
- GT Research Agent - CPG/frozen retail intelligence

**Menu Autopilot:**
- Menu Analysis Agent - item performance, recommendations
- Restaurant Research Agent - QSR/restaurant industry trends

**AirTip:**
- OCR Validation Agent - flags low-confidence scans
- Compliance Agent - tip-out rule validation
- Payroll Prep Agent - export preparation

**Solo Projects:**
- Development agents (Ralph-style) for SidelineIQ, Dosie

---

## Data Model

### Shared Tables (added to each project's Prisma schema)

```prisma
model AgentTask {
  id           String   @id @default(cuid())
  agentType    String   // inventory | briefing | research | development
  status       String   // pending | running | completed | failed
  prompt       String   // What the agent was asked to do
  result       String?  // What it produced (JSON or markdown)
  tokenUsage   Int?     // For future API tracking
  startedAt    DateTime @default(now())
  completedAt  DateTime?
}

model AgentRecommendation {
  id              String    @id @default(cuid())
  agentType       String
  title           String
  recommendation  Json      // Structured recommendation data
  reasoning       String    // Why the agent suggests this
  priority        String    // low | medium | high | urgent
  assignedTo      String?   // clay | charlie | kamal
  humanDecision   String?   // approved | rejected | modified
  humanReasoning  String?   // Why they overrode (if they did)
  appliedAt       DateTime?
  createdAt       DateTime  @default(now())
}

model AgentAlert {
  id            String    @id @default(cuid())
  agentType     String
  priority      String    // low | medium | high | urgent
  title         String
  summary       String
  actionRequired Boolean  @default(false)
  assignedTo    String?
  acknowledgedAt DateTime?
  resolvedAt    DateTime?
  createdAt     DateTime  @default(now())
}

model AgentKnowledge {
  id          String   @id @default(cuid())
  agentType   String
  sourceType  String   // earnings | article | internal | decision
  title       String
  summary     String
  fullContent String?  // Full text if needed
  sourceUrl   String?
  embedding   Float[]? // For semantic search (future)
  ingestedAt  DateTime @default(now())
  expiresAt   DateTime? // Some knowledge gets stale
}
```

---

## Execution Model

### Phase 1: Clay-Triggered (Current - Subscription Model)

Clay triggers agents via Claude Code skills. Agents write to database. Team sees results in dashboard.

```
Monday Workflow:
1. Clay: cd ~/Projects/gt-ims && claude
2. Clay: /gt-monday-briefing
3. Agent runs, writes to AgentTask + AgentRecommendation tables
4. Charlie/Kamal open gt-ims.vercel.app/command-center
5. See briefing + pending approvals
6. Click [APPROVE] or [REJECT] with reasoning
```

### Phase 2: Ralph for Deep Work

Weekly (Fridays), Clay kicks off Ralph loops for development:

```
1. Clay: /ralph-loop "Implement feature X" --max 30
2. Ralph iterates, writes progress to AgentTask table
3. Morning: Review results in dashboard + git
```

### Phase 3 (Future): Scheduled API Agents

When budget allows:
- Vercel cron jobs → API endpoints → Anthropic API (Haiku)
- Hard budget caps ($50/month to start)
- Only for operational tasks (syncs, health checks)

---

## Safety Rails

### Rule 1: Agents Recommend, Humans Decide

Agents NEVER take irreversible actions directly. They write recommendations, humans approve.

### Rule 2: Scope Boundaries in Skills

Each skill has explicit constraints:

```markdown
# Example: /gt-inventory-check skill constraints

Scope:
- READ inventory data, sales history, forecasts
- RECOMMEND reorders, archive candidates, alerts
- NEVER modify data directly
- NEVER suggest changes outside inventory domain
- If issue found outside scope, log as alert for another agent
```

### Rule 3: Development Agent Guardrails

```markdown
# Ralph constraints for all dev work

- DO NOT delete files without explicit approval
- DO NOT change database schema without approval
- DO NOT modify auth/security code without approval
- DO NOT push to main branch
- Work on feature branches only

If scope expansion needed:
1. Document what you found
2. Document what you'd recommend
3. Output <promise>SCOPE_EXPANSION_NEEDED</promise>
4. Wait for human review
```

### Rule 4: Override Tracking

Every recommendation tracks human decisions for audit trail and agent tuning.

---

## UI: Command Center

New page at `/command-center` (GT-IMS) and `/agents` (Menu Autopilot):

```
┌─────────────────────────────────────────────────────────────┐
│  PENDING APPROVALS (3)                           [Filter ▼] │
├─────────────────────────────────────────────────────────────┤
│  📦 Reorder: Strawberry 24ct                    → Charlie   │
│     Stock at 2.1 weeks, recommend 500 units                 │
│     [APPROVE] [MODIFY] [REJECT]                             │
├─────────────────────────────────────────────────────────────┤
│  📊 Weekly Briefing Ready                       → All       │
│     Sales up 12% WoW, 2 CRM deadlines                       │
│     [VIEW REPORT]                                           │
├─────────────────────────────────────────────────────────────┤
│  🔬 Research: UNFI Q4 Analysis                  → Kamal     │
│     UNFI expanding frozen +15% shelf space                  │
│     [READ] [ARCHIVE]                                        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  RECENT ACTIVITY                                             │
├─────────────────────────────────────────────────────────────┤
│  10:32  Research Agent completed UNFI analysis              │
│  10:15  Briefing Agent started Monday prep                  │
│  Yesterday  Inventory recommendation approved (Charlie)     │
└─────────────────────────────────────────────────────────────┘
```

---

## Weekly Operating Rhythm

| Day | Agent Work | Human Work |
|-----|------------|------------|
| **Sunday night** | (Future: scheduled briefing prep) | - |
| **Monday AM** | `/gt-monday-briefing` triggered | Review briefing, approve priorities |
| **Tue-Wed** | Research agents gather intel | Marketing/sales planning |
| **Thu** | Operational checks | Handle exceptions |
| **Friday** | Ralph deep work kicked off | Light oversight |
| **Weekend** | Ralph continues if running | Review results Monday |

---

## Implementation Phases

### Phase 1A: GT-IMS Foundation
1. Add agent tables to Prisma schema
2. Build `/command-center` page (approvals, activity log)
3. Create `/gt-inventory-health` skill (first working agent)

### Phase 1B: Expand GT-IMS Agents
4. `/gt-monday-briefing` skill
5. `/gt-research` skill
6. Routing logic (assign to Charlie/Kamal/Clay)

### Phase 2: Menu Autopilot + AirTip
7. Add agent tables to Menu Autopilot schema
8. Build `/agents` page
9. Build `/tips/agents` section
10. Create `/menu-weekly-report`, `/airtip-ocr-review` skills

### Phase 3: Solo Projects Dashboard
11. Build local HTML dashboard structure
12. JSON file storage for agent state
13. Skills for SidelineIQ/Dosie

### Phase 4 (Future): API Agents
14. Anthropic API setup
15. Vercel cron endpoints
16. Budget caps and circuit breakers

---

## Cost Model

**Current:** $100-200/month Claude Max subscription (flat fee, no per-token risk)

**Future API (when ready):**
| Model | Cost/iteration | 50-iteration Ralph |
|-------|----------------|-------------------|
| Haiku | ~$0.05 | ~$2.50 |
| Sonnet | ~$0.60 | ~$30 |
| Opus | ~$3.00 | ~$150 |

Recommendation: Start with $50/month API cap for scheduled Haiku tasks only.

---

## Open Questions

- [ ] What "relevant" means for proactive research alerts (define triggers)
- [ ] Notification method when approvals are pending (email? text? just check dashboard?)
- [ ] How to handle agent knowledge that spans projects (shared retail intelligence?)

---

## Next Steps

1. Implement Phase 1A (GT-IMS foundation)
2. Test with real inventory check flow
3. Get Charlie/Kamal using dashboard
4. Iterate based on feedback
