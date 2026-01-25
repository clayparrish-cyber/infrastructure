# RALPH MISSION: Close the Agent Learning Loop

## ✅ MISSION COMPLETED - 2026-01-23

**Status:** All 7 success criteria verified. Learning loop is closed.

### What Was Fixed:
1. ✅ Removed duplicate placeholder files (`learning/signal-scoring.ts`, `learning/embeddings.ts`)
2. ✅ Signal scores now calculated and stored when humans approve/reject recommendations
3. ✅ 7-day deduplication prevents duplicate recommendations for same SKU/issue
4. ✅ Similarity query finds past recommendations with high signal scores
5. ✅ Few-shot examples formatted and included in recommendation reasoning
6. ✅ All 32 unit tests pass
7. ✅ GT-IMS builds and typechecks (required `--webpack` flag for Next.js 16)

### Unexpected Issue Fixed:
- **Next.js 16 Turbopack symlink issue**: Turbopack doesn't resolve `file:` linked packages properly. Fixed by adding `--webpack` flag to build and configuring webpack resolve aliases. See skill: `nextjs-exclude-scripts-from-build`

---

## PRIME DIRECTIVE

Fix the inventory-health agent so it learns from past human decisions. Currently, the agent generates embeddings but NEVER queries them. Close this loop.

## SUCCESS CRITERIA

Output `<promise>LEARNING LOOP VERIFIED</promise>` when ALL conditions are met:
1. Duplicate placeholder files removed (signal-scoring.ts, learning/embeddings.ts)
2. `inventory-health.ts` queries similar past recommendations before generating new ones
3. Few-shot examples are formatted and included in recommendation context
4. Deduplication prevents identical recommendations within 7 days
5. Signal scores are updated when humans approve/reject recommendations
6. All existing tests still pass
7. GT-IMS builds and typechecks without errors

## WHAT EXISTS (DO NOT REBUILD)

### agent-learning package (`~/Projects/infrastructure/packages/agent-learning/`)
- `src/scoring/signal-score.ts` - calculateSignalScore() ✅ WORKING
- `src/learning/similarity.ts` - findSimilarRecommendations() ✅ WORKING
- `src/learning/few-shot.ts` - formatExamplesForPrompt() ✅ WORKING
- `src/embeddings/generate.ts` - generateEmbedding() ✅ WORKING

### GT-IMS (`~/Projects/Internal Systems/gt-ims/`)
- `scripts/agents/inventory-health.ts` - THE FILE TO FIX
- `prisma/schema.prisma` - Has AgentRecommendation with embedding, signalScore fields

## WHAT NEEDS TO BE FIXED

### 1. Query Past Decisions (inventory-health.ts)
BEFORE generating new recommendations, the agent MUST:
```typescript
import { findSimilarRecommendations, formatExamplesForPrompt } from '@clayparrish/agent-learning'

// Generate embedding for current context
const contextEmbedding = await generateEmbedding({ text: currentContext, apiKey })

// Find similar past recommendations
const similarRecs = await findSimilarRecommendations(sql, {
  agentType: 'INVENTORY',
  queryEmbedding: contextEmbedding,
  minSignalScore: 0.5,
  maxExamples: 5,
  maxDaysOld: 90
})

// Format as few-shot examples
const fewShotExamples = formatExamplesForPrompt(similarRecs)
// Include fewShotExamples in the recommendation reasoning
```

### 2. Deduplication (inventory-health.ts)
Before creating a recommendation, check if identical one exists within 7 days:
```typescript
const existingRec = await prisma.agentRecommendation.findFirst({
  where: {
    agentType: 'INVENTORY',
    skuId: issue.skuId,
    issueType: issue.issueType,
    createdAt: { gte: sevenDaysAgo }
  }
})
if (existingRec) continue // Skip duplicate
```

### 3. Signal Score Update (EXACT LOCATION)
File: `~/Projects/Internal Systems/gt-ims/src/app/api/agents/recommendations/decide/route.ts`

This route already handles approval/rejection. Add signal score calculation:
```typescript
import { calculateSignalScore } from '@clayparrish/agent-learning'

// After getting the recommendation, before updating:
const recommendation = await prisma.agentRecommendation.findUnique({
  where: { id: recommendationId }
})

const signalScore = calculateSignalScore({
  decision: decision.toLowerCase() as 'approved' | 'modified' | 'rejected',
  priority: recommendation.priority.toLowerCase() as 'critical' | 'high' | 'medium' | 'low',
  createdAt: recommendation.createdAt
})

// Add signalScore to the update:
const updated = await prisma.agentRecommendation.update({
  where: { id: recommendationId },
  data: {
    humanDecision: decision,
    humanReasoning: reasoning || null,
    decidedAt: new Date(),
    appliedAt: decision === 'APPROVED' ? new Date() : null,
    signalScore: signalScore, // ADD THIS
  },
})
```

Note: Map Prisma enums to calculateSignalScore types:
- URGENT/HIGH/MEDIUM/LOW → critical/high/medium/low
- APPROVED/MODIFIED/REJECTED → approved/modified/rejected

### 4. Fix Hardcoded Demand (SKIP FOR NOW - NEEDS DESIGN)
**DO NOT FIX THIS YET** - Requires design decision on where to source demand data.
Leave this line as-is:
```typescript
const estimatedDailyDemand = 10 // Leave for now - separate design task
```

## FILE LOCATIONS

| File | Path |
|------|------|
| inventory-health.ts | `~/Projects/Internal Systems/gt-ims/scripts/agents/inventory-health.ts` |
| signal-score.ts | `~/Projects/infrastructure/packages/agent-learning/src/scoring/signal-score.ts` |
| similarity.ts | `~/Projects/infrastructure/packages/agent-learning/src/learning/similarity.ts` |
| few-shot.ts | `~/Projects/infrastructure/packages/agent-learning/src/learning/few-shot.ts` |
| Command Center | `~/Projects/Internal Systems/gt-ims/src/app/(dashboard)/command-center/` |

## VERIFICATION COMMANDS

```bash
# 1. Package tests pass
cd ~/Projects/infrastructure/packages/agent-learning && npm test

# 2. GT-IMS builds
cd ~/Projects/Internal\ Systems/gt-ims && npm run build

# 3. TypeScript compiles
cd ~/Projects/Internal\ Systems/gt-ims && npm run typecheck

# 4. Run agent (requires DATABASE_URL)
cd ~/Projects/Internal\ Systems/gt-ims && npx tsx scripts/agents/inventory-health.ts
```

## FILE CONSOLIDATION

Remove duplicate placeholder files that conflict with implementations:
```bash
cd ~/Projects/infrastructure/packages/agent-learning/src

# These placeholders duplicate implemented files:
rm learning/signal-scoring.ts    # Duplicates scoring/signal-score.ts
rm learning/embeddings.ts        # Duplicates embeddings/generate.ts
```

**Canonical locations:**
- Signal scoring: `src/scoring/signal-score.ts` ✅
- Embeddings: `src/embeddings/generate.ts` ✅

**Phase 2/3 placeholders (LEAVE ALONE for now):**
- `src/experiments/*` - A/B testing (Phase 2)
- `src/knowledge/*` - Cross-agent knowledge sharing (Phase 3)
- `src/metrics/*` - Performance metrics (Phase 2)
- `src/schemas/*` - Database schemas (may be needed)

## CONSTRAINTS

- DO NOT create new packages or reorganize the project structure
- DO NOT change the Prisma schema (fields already exist)
- DO NOT modify the agent-learning package exports (already correct)
- DO use existing functions from @clayparrish/agent-learning
- DO keep backward compatibility with existing Command Center UI

## ITERATION STRATEGY

1. First iteration: Remove duplicate placeholder files
2. Second iteration: Add signal score update to decide route
3. Third iteration: Add deduplication check to inventory-health.ts
4. Fourth iteration: Add similarity query to inventory-health.ts
5. Fifth iteration: Verify all tests pass, typecheck passes, build succeeds

## COMPLETION PROMISE

When the learning loop is verified working:
```
<promise>LEARNING LOOP VERIFIED</promise>
```
