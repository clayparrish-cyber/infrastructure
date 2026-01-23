# Phase 1 Agent Test Plan

**Date:** 2026-01-23
**Updated:** 2026-01-23 (revised to use existing infrastructure)
**Goal:** Validate Phase 1 marketplace agents work end-to-end with GT-IMS

---

## Overview

Phase 1 installed 15 agents from aitmpl.com marketplace. This plan validates they:
1. Execute without errors
2. Produce correctly formatted output
3. Integrate with `AgentRecommendation` table
4. Appear in Command Center dashboard

---

## Existing Infrastructure (DO NOT REBUILD)

**Key discovery:** GT-IMS already has working agent scripts that establish the pattern.

### What Already Exists

| Component | Location | Use For |
|-----------|----------|---------|
| `inventory-health.ts` | `gt-ims/scripts/agents/` | Template for new agent scripts |
| `monday-briefing.ts` | `gt-ims/scripts/agents/` | Template for briefing-style agents |
| `agent-store.ts` | `infrastructure/tools/agent-dashboard/scripts/` | Projects without DBs (SidelineIQ, Dosie) |
| `@clayparrish/agent-learning` | `infrastructure/packages/agent-learning/` | Embeddings, few-shot learning |
| Agent Dashboard | `infrastructure/tools/agent-dashboard/` | HTML dashboard for solo projects |
| Command Center | `gt-ims/app/command-center/` | GT-IMS approval UI |

### Established Pattern (from inventory-health.ts)

```typescript
// 1. Load environment
config({ path: '.env.local' })
config({ path: '.env' })

// 2. Create Prisma client with adapter
const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

// 3. Create AgentTask record
const task = await prisma.agentTask.create({
  data: {
    agentType: 'INVENTORY',  // or 'BRIEFING', 'LEGAL', etc.
    status: 'RUNNING',
    prompt: 'Description of what this run is doing',
  },
})

// 4. Do analysis work (agent-specific logic)
// ...

// 5. Create AgentRecommendation records
await prisma.agentRecommendation.create({
  data: {
    agentType: 'INVENTORY',
    taskId: task.id,
    priority: 'HIGH',
    recommendation: jsonOutput,
    reasoning: 'Why this recommendation',
    assignedTo: 'clay',
  },
})

// 6. Optionally generate embeddings for few-shot learning
const embedding = await generateEmbedding(embeddingText)

// 7. Update task to COMPLETED
await prisma.agentTask.update({
  where: { id: task.id },
  data: { status: 'COMPLETED', completedAt: new Date() },
})
```

### Architecture (Already Implemented)

```
┌─────────────────────────────────────────────────────────────┐
│              Agent Scripts (per venture)                     │
│    gt-ims/scripts/agents/inventory-health.ts                │
│    gt-ims/scripts/agents/monday-briefing.ts                 │
│    (NEW) gt-ims/scripts/agents/legal-review.ts              │
│    (NEW) gt-ims/scripts/agents/research-coordinator.ts      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Shared Infrastructure                     │
│         @clayparrish/agent-learning                          │
│         - Few-shot learning, scoring, embeddings             │
│         - Already integrated in inventory-health.ts          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Persistence Layer                         │
│         AgentTask, AgentRecommendation, AgentAlert           │
│         - Already exists in GT-IMS Prisma schema             │
│         - Command Center already reads from these tables     │
└─────────────────────────────────────────────────────────────┘
```

### Why NOT Build New Runner

❌ **Original plan:** Build generic `agent-runner.ts`
✅ **Revised plan:** Copy pattern from `inventory-health.ts`

Reasons:
- Pattern already proven and working in production
- Agent-specific scripts are clearer than generic runner + config
- Each agent has unique data access needs
- Easier to debug when each agent is self-contained
- When scaling to API, each script becomes a serverless function

---

## Test Cases

### Test 1: Existing Agent Verification
**Script:** `gt-ims/scripts/agents/inventory-health.ts` (already exists)
**Purpose:** Verify existing infrastructure still works
**Success Criteria:**
- [ ] Script runs without error: `npx tsx scripts/agents/inventory-health.ts`
- [ ] AgentTask created with status COMPLETED
- [ ] AgentRecommendation(s) created
- [ ] Visible in Command Center at `/command-center`

### Test 2: Monday Briefing (Existing)
**Script:** `gt-ims/scripts/agents/monday-briefing.ts` (already exists)
**Purpose:** Verify briefing agent pattern works
**Success Criteria:**
- [ ] Script runs without error: `npx tsx scripts/agents/monday-briefing.ts`
- [ ] AgentTask created with status COMPLETED
- [ ] Briefing content in AgentRecommendation
- [ ] Visible in Command Center

### Test 3: Legal Review (NEW - to create)
**Script:** `gt-ims/scripts/agents/legal-review.ts` (create from template)
**Agent Prompt:** `.claude/agents/legal-advisor.md`
**Test Input:** "Review this campaign: 'Gallant Tiger PB&J - Guaranteed to be the best frozen sandwich. 100% satisfaction or your money back.'"
**Success Criteria:**
- [ ] Script created following inventory-health.ts pattern
- [ ] Flags risk keywords (guaranteed, best, 100%)
- [ ] Returns risk level assessment
- [ ] Creates AgentRecommendation with findings
- [ ] Visible in Command Center

### Test 4: Research Query (NEW - to create)
**Script:** `gt-ims/scripts/agents/research-request.ts` (create from template)
**Agent Prompt:** `.claude/agents/research-coordinator.md`
**Test Input:** "Research UNFI frozen food shelf space trends for 2026"
**Success Criteria:**
- [ ] Script created following inventory-health.ts pattern
- [ ] Produces research summary with sources
- [ ] Creates AgentRecommendation with findings
- [ ] Visible in Command Center

### Test 5: Database Optimization (NEW - to create)
**Script:** `gt-ims/scripts/agents/db-optimization.ts` (create from template)
**Agent Prompt:** `.claude/agents/postgresql-dba.md`
**Test Input:** "Analyze slow queries and suggest optimizations"
**Success Criteria:**
- [ ] Script created following inventory-health.ts pattern
- [ ] Connects to database successfully
- [ ] Identifies any slow queries or suggests "all queries healthy"
- [ ] Creates AgentRecommendation with findings
- [ ] Visible in Command Center

---

## Files to Create

All new scripts go in `gt-ims/scripts/agents/` following the established pattern.

### 1. legal-review.ts (NEW)

```typescript
/**
 * Legal Review Agent
 *
 * Reviews marketing content for compliance risks using Legal Advisor agent.
 *
 * Usage: npx tsx scripts/agents/legal-review.ts "campaign text to review"
 */

// Follow inventory-health.ts pattern:
// 1. Load env, create Prisma client
// 2. Create AgentTask with agentType: 'LEGAL'
// 3. Parse input campaign text
// 4. Check against escalation criteria from phase-1-config.ts
// 5. Create AgentRecommendation with risk assessment
// 6. Update task to COMPLETED
```

### 2. research-request.ts (NEW)

```typescript
/**
 * Research Request Agent
 *
 * Coordinates research queries using Deep Research Team agents.
 *
 * Usage: npx tsx scripts/agents/research-request.ts "research query"
 */

// Follow inventory-health.ts pattern:
// 1. Load env, create Prisma client
// 2. Create AgentTask with agentType: 'RESEARCH'
// 3. Parse research query
// 4. Execute research (web search, synthesis)
// 5. Create AgentRecommendation with findings + sources
// 6. Update task to COMPLETED
```

### 3. db-optimization.ts (NEW)

```typescript
/**
 * Database Optimization Agent
 *
 * Analyzes database performance using PostgreSQL DBA agent.
 *
 * Usage: npx tsx scripts/agents/db-optimization.ts
 */

// Follow inventory-health.ts pattern:
// 1. Load env, create Prisma client
// 2. Create AgentTask with agentType: 'DBA'
// 3. Query pg_stat_statements or EXPLAIN ANALYZE on key queries
// 4. Identify slow queries, missing indexes
// 5. Create AgentRecommendation with optimization suggestions
// 6. Update task to COMPLETED
```

### 4. test-phase1.ts (Test Harness)

```typescript
/**
 * Phase 1 Test Harness
 *
 * Runs all agent tests sequentially and reports results.
 *
 * Usage: npx tsx scripts/agents/test-phase1.ts
 */

// 1. Run inventory-health.ts (existing)
// 2. Run monday-briefing.ts (existing)
// 3. Run legal-review.ts with test input
// 4. Run research-request.ts with test query
// 5. Run db-optimization.ts
// 6. Query AgentTask table for results
// 7. Output summary to console + markdown file
```

---

## Environment Setup

### GT-IMS Environment (Already Configured)

GT-IMS already has `.env` and `.env.local` files with:
- `DATABASE_URL` - Neon PostgreSQL connection string
- Prisma client configured with adapter pattern

### OpenAI (Optional - for embeddings)

If few-shot learning is desired:
```bash
OPENAI_API_KEY=sk-...
```

The `@clayparrish/agent-learning` package handles graceful degradation if not set.

### Database Schema (Already Exists)

GT-IMS Prisma schema already has:
- `AgentTask` - tracks execution
- `AgentRecommendation` - stores recommendations for approval
- `AgentAlert` - stores alerts
- `AgentKnowledge` - cross-agent intelligence (future)

No migrations needed.

---

## Execution Steps

### Step 1: Design Doc
- [x] Create `docs/plans/2026-01-23-phase1-test-plan.md` (this file)
- [x] Review existing infrastructure (inventory-health.ts, monday-briefing.ts)
- [x] Updated plan to use existing patterns

### Step 2: Verify Existing Agents
- [ ] Run `inventory-health.ts` - verify it still works
- [ ] Run `monday-briefing.ts` - verify it still works
- [ ] Check Command Center shows results

### Step 3: Create New Agent Scripts
- [ ] Create `legal-review.ts` following inventory-health.ts pattern
- [ ] Create `research-request.ts` following inventory-health.ts pattern
- [ ] Create `db-optimization.ts` following inventory-health.ts pattern

### Step 4: Create Test Harness
- [ ] Create `test-phase1.ts` to run all agents
- [ ] Add result reporting

### Step 5: Run Full Test Suite
- [ ] Execute `npx tsx scripts/agents/test-phase1.ts`
- [ ] Verify all agents complete successfully
- [ ] Check Command Center shows all recommendations

### Step 6: Update Checklist
- [ ] Mark items complete in `docs/phase-1-implementation-guide.md`
- [ ] Document any issues found
- [ ] Commit results

---

## Success Criteria

**Phase 1 Testing Complete when:**
- [ ] Existing agents (inventory-health, monday-briefing) run successfully
- [ ] New agents (legal-review, research-request, db-optimization) created and run
- [ ] All 5 AgentTask records show status: COMPLETED
- [ ] AgentRecommendations visible in Command Center at `/command-center`
- [ ] No critical errors in any agent execution
- [ ] Results documented in this file or test-results.md

---

## Troubleshooting

### Script fails to start
```bash
# Check you're in the right directory
cd "/Users/clayparrish/Projects/Internal Systems/gt-ims"

# Verify dependencies
npm install

# Try running directly
npx tsx scripts/agents/inventory-health.ts
```

### Database connection failed
```bash
# Check .env files exist
ls -la .env .env.local

# Verify DATABASE_URL is set (don't print the full URL)
grep DATABASE_URL .env.local | head -c 30
```

### Prisma client errors
```bash
# Regenerate Prisma client
npx prisma generate

# If schema changed, run migrations
npx prisma migrate dev
```

### Recommendation not appearing in Command Center
1. Check record exists: Query `AgentRecommendation` table directly
2. Verify Command Center route: Visit `https://gt-ims.vercel.app/command-center`
3. Check filters: Command Center may filter by status or date

### Agent script creates task but no recommendation
Check the script logic - ensure `prisma.agentRecommendation.create()` is called before the task is marked COMPLETED.

---

## Files Summary

| File | Location | Status |
|------|----------|--------|
| `inventory-health.ts` | gt-ims/scripts/agents/ | ✅ Exists |
| `monday-briefing.ts` | gt-ims/scripts/agents/ | ✅ Exists |
| `legal-review.ts` | gt-ims/scripts/agents/ | 🔨 To Create |
| `research-request.ts` | gt-ims/scripts/agents/ | 🔨 To Create |
| `db-optimization.ts` | gt-ims/scripts/agents/ | 🔨 To Create |
| `test-phase1.ts` | gt-ims/scripts/agents/ | 🔨 To Create |

---

## Next Steps After Testing

1. **If all pass:**
   - Update `phase-1-implementation-guide.md` checklist
   - Expand pattern to Menu Autopilot and AirTip
   - Consider Phase 2 agents (Product Strategist, Task Decomposition, Risk Manager)

2. **If failures:**
   - Debug specific agent
   - Check database schema matches expectations
   - Verify agent prompt in `.claude/agents/` is correct

3. **After validation:**
   - Document lessons learned
   - Commit all new scripts
   - Plan Phase 2 implementation

---

**End of Design**
