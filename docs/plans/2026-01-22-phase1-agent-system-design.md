# Phase 1 Agent System Design

**Date:** 2026-01-22
**Status:** Validated and Ready for Implementation
**Agents Installed:** 19 agents across 5 categories

---

## Design Decisions

### Decision 1: Research Coordinator Architecture
**Choice:** Single Shared Research Coordinator (Option A)
**Rationale:** Enables cross-venture pattern detection, more efficient, learns faster with higher research volume.

### Decision 2: Business Analyst Scope
**Choice:** Cross-Venture Aggregated Dashboard (Option A)
**Rationale:** Portfolio-level CEO view with drill-down capability. Surfaces "where's the fire?" immediately.

### Decision 3: Legal Escalation Mechanism
**Choice:** Rule-Based Escalation (Option A)
**Rationale:** Transparent, consistent, fast. Marketing has clear criteria for when to escalate.

### Decision 4: Agent Communication Mechanism
**Choice:** Database-Mediated Communication (Option A)
**Rationale:** Leverages existing schema, reliable, auditable, no new infrastructure needed.

### Decision 5: Agent Execution Environment
**Choice:** Claude Code Local Execution (Option A)
**Rationale:** $0 additional cost, uses existing Claude Max subscription.

---

## System Architecture

### Agent Layer (19 agents)

**Business Marketing (3 agents):**
1. Business Analyst - Cross-venture Monday briefing
2. Legal Advisor - Campaign compliance reviews
3. Marketing Attribution Analyst - Channel performance tracking

**Deep Research Team (13 agents):**
4. Research Coordinator - Orchestrates research across ventures
5. Research Orchestrator - Coordinates complex projects
6. Query Clarifier - Validates research requests
7. Competitive Intelligence Analyst - Market positioning
8. Data Analyst - Quantitative analysis
9. Academic Researcher - Scholarly sources
10. Fact Checker - Source validation
11. Research Synthesizer - Combines findings
12. Report Generator - Executive summaries
13. Research Brief Generator - Actionable research briefs
14. Technical Researcher - Code/technical docs
15-16. Additional specialized researchers as needed

**Database Optimization (1 agent):**
17. PostgreSQL DBA - Query optimization

### Data Layer (Existing - No Schema Changes)

**Tables:**
- AgentTask - Tracks agent execution
- AgentRecommendation - Stores recommendations for approval
- AgentAlert - Urgent items requiring attention
- AgentKnowledge - Cross-agent insights and research findings

### Communication Layer

**Mechanism:** Database-mediated polling (every 5 minutes)

**Communication Flows:**

1. **Marketing → Legal:**
   - Marketing writes: `requiresLegalReview: true, status: "pending_legal"`
   - Legal polls for `pending_legal` items
   - Legal updates: `status: "legal_approved", legalNotes: "..."`

2. **Research → Knowledge Base:**
   - Research Team writes findings to AgentKnowledge
   - Other agents query AgentKnowledge before making recommendations
   - Example: GT Inventory Agent queries market intelligence before reorder recommendations

3. **All Agents → You:**
   - Write to AgentRecommendation with `assignedTo: "clay"`
   - You review in command-center dashboard
   - Approve/reject with reasoning (feedback loop for learning)

### Execution Model

**Trigger:** Manual via Claude Code CLI
- `/monday-briefing` - Business Analyst generates executive summary
- `/research [topic]` - Deep Research Team executes
- Campaign creation triggers Marketing → Legal flow

**Cost:** $0 additional (uses Claude Max subscription)

---

## Data Flows

### Monday Morning Briefing Flow

**Trigger:** `claude` → `/monday-briefing`

**Execution:**
1. Business Analyst queries 5 venture databases in parallel
2. Marketing Attribution Analyst provides channel performance
3. PostgreSQL DBA provides database health metrics
4. Business Analyst synthesizes:
   - Portfolio overview (total revenue, biggest movers)
   - Top 3 priorities for the week
   - Venture-specific drill-downs
5. Writes to AgentRecommendation (priority: HIGH, assignedTo: clay)

**Your Review:**
- Open command-center dashboard
- See briefing + pending approvals
- Click [ACKNOWLEDGE]

### Marketing → Legal Escalation Flow

**Trigger:** Content Marketer drafts campaign

**Execution:**
1. Marketing Agent evaluates against escalation rules:
   - Contains "guaranteed/proven/scientifically validated"?
   - New campaign type (not in historical DB)?
   - International market?
   - User-generated content?
2. Rule triggers → writes `requiresLegalReview: true, status: "pending_legal"`
3. Legal Advisor polls DB (every 5 minutes)
4. Legal reviews, provides feedback
5. Updates: `status: "legal_approved", legalNotes: "Recommend softer claim"`
6. Marketing revises, surfaces to you for final approval

### Deep Research Team Flow

**Trigger:** You request research (e.g., "Research UNFI frozen expansion")

**Execution:**
1. Query Clarifier analyzes request, asks clarifying questions if needed
2. Research Coordinator creates execution plan:
   - Task 1: Competitive Intelligence Analyst → UNFI vs competitors
   - Task 2: Data Analyst → Quantify shelf space growth
   - Task 3: Academic Researcher → Industry reports
   - Task 4: Fact Checker → Verify all claims
3. Specialized researchers execute in parallel, write findings to DB
4. Research Synthesizer combines findings
5. Report Generator formats executive summary
6. Writes to AgentRecommendation (for you) AND AgentKnowledge (for other agents)

**Cross-Agent Knowledge Sharing:**
- Research findings written to AgentKnowledge with:
  - `knowledgeType: "market-intelligence"`
  - `subject: "unfi-frozen-expansion"`
  - `validUntil: "2026-07-22"` (6 months)
- GT Inventory Agent queries AgentKnowledge before reorder recommendations
- Uses research to adjust quantities: "Order 20% more - UNFI expansion opportunity"

---

## Configuration Structure

**File:** `/Users/clayparrish/projects/infrastructure/config/agents/phase-1-config.ts`

**Key Elements:**

1. **Business Analyst:**
   - Ventures: `['gt-ims', 'menu-autopilot', 'airtip', 'sidelineiq', 'dosie']`
   - Key metrics per venture
   - Alert thresholds (revenue drop >10%, error spike >20%)

2. **Legal Advisor:**
   - Escalation rules (keyword matching + campaign type checks)
   - Exclusion rules (what NOT to review)

3. **Deep Research Team:**
   - Research domains per venture
   - Quality standards (minimum 3 sources, fact-checking required)

4. **Database Connections:**
   - Environment variables per venture
   - Performance thresholds for PostgreSQL DBA

---

## Error Handling Strategy

### Database Write Failures
- Retry 3 times with exponential backoff
- Fall back to file logging if DB unavailable
- Alert via AgentAlert when recovered

### Agent Execution Failures
- Log to AgentTask with error details
- No silent failures (all errors surface to dashboard)
- Failed tasks visible in command-center activity log

### Missing Data
- Business Analyst proceeds with available data
- Flags gaps in report: "SidelineIQ data unavailable"
- Doesn't block entire briefing

### Legal Advisor Unavailable
- Campaign stays in `pending_legal` status
- Surfaces to you: "Awaiting Legal review"
- You can override if urgent

---

## Cross-Agent Knowledge Sharing

### Research Findings Flow

**When Research completes:**
1. Report Generator creates two outputs:
   - Executive summary → AgentRecommendation (for you)
   - Structured insights → AgentKnowledge (for other agents)

**AgentKnowledge Schema:**
```typescript
{
  sourceAgentType: "research-coordinator",
  knowledgeType: "market-intelligence",
  subject: "unfi-frozen-expansion",
  insight: "UNFI expanding frozen shelf space +15% over next 12 months",
  data: {
    category: "frozen-food",
    growth_rate: 0.15,
    timeframe: "12-months",
    competitors: { kroger: 0.08, albertsons: 0.10 }
  },
  confidence: 0.85,
  validUntil: "2026-07-22"
}
```

**Agents Query Before Recommendations:**
- GT Inventory Agent: Checks market intelligence before reorder quantities
- Business Analyst: Includes recent research in Monday briefing
- Product Strategist (Phase 2): Uses research to validate/prioritize ideas

### Knowledge Lifecycle

**Validity Periods:**
- Market intelligence: 6 months
- Regulatory research: 12 months
- Technology trends: 3 months

**Expiration Handling:**
- Agents check `validUntil` before using insights
- Expired knowledge flagged for refresh
- Research Coordinator gets re-research task

---

## Testing Strategy

### Week 1: Individual Agent Testing

**Day 1-2:** Installation (COMPLETE ✅)
**Day 3:** Business Analyst test (`/monday-briefing`)
**Day 4:** Legal Advisor test (draft campaign with claim)
**Day 5:** Deep Research Team test (restaurant POS research)

### Week 2: Integration Testing

**Day 8-9:** Cross-agent integration
- GT Inventory Agent queries UNFI research from AgentKnowledge
- Verify recommendations reference research insights

**Day 10:** End-to-end workflow
- Monday briefing
- Research request
- Campaign creation with Legal review
- All outputs in command-center dashboard

---

## Success Metrics (End of Week 2)

### Quantitative
- ✅ Monday briefing: <5 min execution time
- ✅ Cross-venture aggregation: 5 ventures in single report
- ✅ Legal escalation rate: 10-20% of campaigns
- ✅ Research reports: 3+ sources per claim, fact-checked
- ✅ Database queries: <200ms average
- ✅ Zero silent failures

### Qualitative
- ✅ Briefings actionable (can make decisions from them)
- ✅ Research insights useful (agents reference in recommendations)
- ✅ Legal reviews helpful (Marketing revisions based on feedback)
- ✅ Time saved: 5-10 hours/week

---

## Implementation Status

### Phase 1 Agents: INSTALLED ✅
- Business Analyst ✅
- Legal Advisor ✅
- Marketing Attribution Analyst ✅
- Deep Research Team (13 agents) ✅
- PostgreSQL DBA ✅

### Next Steps:
1. Create `phase-1-config.ts` configuration file
2. Test Monday briefing flow
3. Test Legal escalation flow
4. Test Deep Research Team flow
5. Verify cross-agent knowledge sharing

---

**End of Design Document**
