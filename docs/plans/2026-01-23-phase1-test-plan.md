# Phase 1 Agent Test Plan

**Date:** 2026-01-23
**Goal:** Validate Phase 1 marketplace agents work end-to-end with GT-IMS

---

## Overview

Phase 1 installed 15 agents from aitmpl.com marketplace. This plan validates they:
1. Execute without errors
2. Produce correctly formatted output
3. Integrate with `AgentRecommendation` table
4. Appear in Command Center dashboard

---

## Architecture

### Layer Separation (Scaled Solution)

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent Prompts                             │
│         .claude/agents/*.md (pure reasoning)                │
│         - Business Analyst, Legal Advisor, etc.              │
│         - Become API system prompts when scaling             │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Runner Scripts                            │
│         scripts/runners/agent-runner.ts                      │
│         - Loads agent prompt + config                        │
│         - Invokes agent (Task tool or API)                   │
│         - Persists output to AgentRecommendation             │
│         - Becomes serverless functions when scaling          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Shared Infrastructure                     │
│         @clayparrish/agent-learning                          │
│         - Few-shot learning, scoring, embeddings             │
│         - Stays same across local and API execution          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Persistence Layer                         │
│         AgentRecommendation table (per venture)              │
│         - GT-IMS, Menu Autopilot, AirTip databases           │
└─────────────────────────────────────────────────────────────┘
```

### Why This Architecture

- **Agents stay pure**: No DB logic in prompts, just reasoning
- **Runners are reusable**: Same runner works for any agent type
- **Scales to API**: Runners become serverless functions, prompts become system messages
- **Learning is centralized**: `agent-learning` package handles cross-cutting concerns

---

## Test Cases

### Test 1: Database Connection
**Agent:** PostgreSQL DBA
**Input:** "List tables in GT-IMS database"
**Success Criteria:**
- [ ] Connects to database without error
- [ ] Returns list of tables
- [ ] No sensitive data exposed in output

### Test 2: Monday Briefing
**Agent:** Business Analyst
**Input:** "Generate executive briefing for GT-IMS. Focus on inventory metrics."
**Success Criteria:**
- [ ] Produces structured briefing
- [ ] Includes key metrics from config (inventory_turnover, stockout_rate, etc.)
- [ ] Under 500 words (per config)
- [ ] Surfaces top 3 priorities

### Test 3: Legal Escalation
**Agent:** Legal Advisor
**Input:** "Review this marketing campaign: 'Gallant Tiger PB&J - Guaranteed to be the best frozen sandwich on the market. 100% satisfaction or your money back.'"
**Success Criteria:**
- [ ] Flags "guaranteed" keyword
- [ ] Flags "best" keyword
- [ ] Flags "100%" keyword
- [ ] Returns risk level (Low/Medium/High)
- [ ] Provides specific recommendations

### Test 4: Research Query
**Agent:** Research Coordinator → delegates to specialists
**Input:** "Research UNFI frozen food shelf space trends for 2026. Limit to 3 sources."
**Success Criteria:**
- [ ] Query Clarifier validates scope
- [ ] Competitive Intelligence Analyst contributes
- [ ] Research Synthesizer combines findings
- [ ] Report has citations
- [ ] Output is executive summary format (not raw data)

### Test 5: Attribution Analysis
**Agent:** Marketing Attribution Analyst
**Input:** "Analyze GT-IMS marketing channel performance for the past 30 days."
**Success Criteria:**
- [ ] Attempts to connect to analytics data
- [ ] Returns channel breakdown (or graceful "no data" message)
- [ ] Follows attribution model from config (last_touch)

---

## Files to Create

### 1. scripts/runners/agent-runner.ts

Generic runner that:
- Loads agent prompt from `.claude/agents/{name}.md`
- Loads venture config from `config/agents/phase-1-config.ts`
- Accepts database connection string
- Invokes agent with structured prompt
- Parses output into AgentRecommendation format
- Writes to database using Prisma or raw SQL
- Returns structured result

```typescript
interface AgentRunnerConfig {
  agentName: string;           // e.g., 'business-analyst'
  venture: string;             // e.g., 'gt-ims'
  databaseUrl: string;         // connection string
  prompt: string;              // user prompt for this run
  priority?: 'low' | 'medium' | 'high';
}

interface AgentRunnerResult {
  success: boolean;
  agentName: string;
  output: string;
  recommendation?: {
    id: string;
    type: string;
    content: string;
    priority: string;
  };
  error?: string;
  durationMs: number;
}
```

### 2. scripts/runners/test-phase1.ts

Test harness that:
- Runs all 5 test cases sequentially
- Loads database URLs from environment
- Logs progress to console
- Writes results to `docs/plans/2026-01-23-phase1-test-results.md`
- Reports pass/fail summary

```typescript
const testCases: TestCase[] = [
  {
    name: 'DB Connection',
    agent: 'postgresql-dba',
    venture: 'gt-ims',
    prompt: 'List tables in the GT-IMS database',
    validate: (result) => result.output.includes('table') && !result.error
  },
  // ... other test cases
];
```

---

## Environment Setup

### Required Environment Variables

```bash
# GT-IMS (primary test target)
GT_IMS_DATABASE_URL=postgresql://...

# Optional for expanded testing
MENU_AUTOPILOT_DATABASE_URL=postgresql://...
AIRTIP_DATABASE_URL=postgresql://...
SIDELINEIQ_DATABASE_URL=postgresql://...

# OpenAI for embeddings (used by agent-learning)
OPENAI_API_KEY=sk-...
```

### Database Schema Requirements

Each venture database needs these tables (already exist per AGENT_PLANS.md):
- `AgentTask` - tracks execution
- `AgentRecommendation` - stores recommendations for approval
- `AgentAlert` - stores alerts
- `AgentKnowledge` - cross-agent intelligence (future)

---

## Execution Steps

### Step 1: Write Design Doc
- [x] Create `docs/plans/2026-01-23-phase1-test-plan.md` (this file)

### Step 2: Create Agent Runner
- [ ] Create `scripts/runners/` directory
- [ ] Implement `agent-runner.ts`
- [ ] Add dependencies to package.json if needed

### Step 3: Create Test Harness
- [ ] Implement `test-phase1.ts`
- [ ] Define all 5 test cases
- [ ] Add result reporting

### Step 4: Run Tests
- [ ] Set environment variables
- [ ] Execute `npx tsx scripts/runners/test-phase1.ts`
- [ ] Review results

### Step 5: Update Checklist
- [ ] Mark items complete in `docs/phase-1-implementation-guide.md`
- [ ] Document any issues found
- [ ] Commit results

---

## Success Criteria

**Phase 1 Testing Complete when:**
- [ ] All 5 test cases pass
- [ ] At least 1 AgentRecommendation written to GT-IMS database
- [ ] Recommendation visible in Command Center dashboard
- [ ] No critical errors in agent execution
- [ ] Results documented in test-results.md

---

## Troubleshooting

### Agent not found
Check `.claude/agents/{name}.md` exists. Run `ls ~/.claude/agents/` to verify.

### Database connection failed
Verify `GT_IMS_DATABASE_URL` is set and database is accessible.

### Agent returns empty output
Check agent prompt has required context. May need to pass config values explicitly.

### Recommendation not appearing in Command Center
Verify:
1. Record exists in `AgentRecommendation` table
2. Command Center is connected to same database
3. Status is not filtered out

---

## Next Steps After Testing

1. **If all pass:** Expand to Menu Autopilot and AirTip
2. **If failures:** Debug specific agent, adjust prompts/config
3. **After validation:** Move to Phase 2 (Innovation Funnel agents)

---

**End of Design**
