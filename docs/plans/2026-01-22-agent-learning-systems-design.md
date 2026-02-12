# Agent Learning Systems Design

**Date:** 2026-01-22
**Scope:** Cross-project agent infrastructure
**Package:** `@clayparrish/agent-learning`

## Overview

This design implements four interconnected systems that enable agents to learn from past decisions and improve over time, based on feedback loop principles for production AI agents.

**Systems:**
1. **Metrics Tracking** - Measure agent performance (approval rates, decision times, override patterns)
2. **Few-Shot Learning** - Use past high-quality recommendations as examples for new recommendations
3. **Experiment Framework** - A/B test changes to validate improvements
4. **AgentKnowledge Layer** - Enable cross-agent intelligence and shared insights

**Architecture Principle:** Hub-and-spoke model. The `@clayparrish/agent-learning` package is the central hub containing all agent infrastructure (schemas, utilities, learning systems). Individual projects (gt-ims, menu-autopilot, sidelineiq) are spokes that import shared infrastructure but implement domain-specific agent logic independently.

**Rollout Sequence:**
1. Start with GT-IMS (Inventory Health + Monday Briefing agents)
2. Extend to Menu Autopilot (OCR Review + Menu Weekly Report agents)
3. Extend to SidelineIQ (Marketing + Curriculum agents)
4. Build all four systems bottom-up: Metrics → Few-Shot Learning → Experiments → AgentKnowledge

## Package Structure

```
@clayparrish/agent-learning/
├── src/
│   ├── schemas/
│   │   ├── agent-task.ts           # Existing, migrated from projects
│   │   ├── agent-recommendation.ts # Existing, migrated, with learning extensions
│   │   ├── agent-alert.ts          # Existing, migrated from projects
│   │   ├── agent-metrics.ts        # NEW: Performance tracking
│   │   ├── agent-experiment.ts     # NEW: A/B testing
│   │   └── agent-knowledge.ts      # NEW: Cross-agent insights
│   │
│   ├── metrics/
│   │   ├── track.ts                # Daily aggregation job
│   │   └── query.ts                # Fetch metrics for dashboards
│   │
│   ├── learning/
│   │   ├── embeddings.ts           # OpenAI embedding generation
│   │   ├── similarity.ts           # pgvector similarity search
│   │   ├── signal-scoring.ts       # Calculate recommendation quality scores
│   │   └── few-shot.ts             # Find and format examples
│   │
│   ├── experiments/
│   │   ├── create.ts               # Set up A/B test
│   │   ├── assign.ts               # Traffic splitting logic
│   │   ├── analyze.ts              # Statistical significance testing
│   │   └── types.ts                # Experiment config types
│   │
│   ├── knowledge/
│   │   ├── share.ts                # Write cross-agent insights
│   │   ├── query.ts                # Retrieve relevant insights
│   │   └── types.ts                # Knowledge types and structures
│   │
│   └── index.ts                    # Public API
│
├── migrations/
│   ├── gt-ims/
│   │   ├── 001_add_embeddings.sql
│   │   ├── 002_add_metrics.sql
│   │   ├── 003_add_experiments.sql
│   │   └── 004_add_knowledge.sql
│   ├── menu-autopilot/
│   │   └── [same structure]
│   └── sidelineiq/
│       └── [same structure]
│
└── package.json
```

## System 1: Metrics Tracking

### Goal
Measure agent performance over time to understand what's working and validate that improvements actually improve outcomes.

### Database Schema

```typescript
AgentMetrics {
  id: string (uuid)
  projectId: string               // 'gt-ims', 'menu-autopilot', 'sidelineiq'
  agentType: string               // 'inventory-health', 'ocr-review', etc.
  metricDate: Date                // Day this metric covers

  // Volume metrics
  recommendationsGenerated: number
  recommendationsApproved: number
  recommendationsRejected: number
  recommendationsModified: number

  // Time metrics (milliseconds)
  avgTimeToDecision: number       // From createdAt -> decidedAt
  avgApprovalTime: number         // For approved only
  avgRejectionTime: number        // For rejected only

  // Segmented by priority
  urgentCount: number
  urgentApprovalRate: number      // Percentage (0-100)
  highCount: number
  highApprovalRate: number
  mediumCount: number
  mediumApprovalRate: number
  lowCount: number
  lowApprovalRate: number

  createdAt: Date
}
```

### Collection Strategy

**Nightly aggregation job:**
- Runs at 2am daily
- Queries previous day's `AgentRecommendation` records
- Calculates metrics per project + agent type
- Inserts one row per project/agent/day

**Why daily aggregates?**
- Fast dashboard queries (no need to scan all recommendations)
- Historical trending (weeks/months of data)
- Cheap to compute (small batch job)

### API

```typescript
// Collect metrics for yesterday
await collectDailyMetrics(projectId: string, date: Date)

// Query for dashboards
await getMetricsTrend(
  projectId: string,
  agentType: string,
  startDate: Date,
  endDate: Date
): Promise<AgentMetrics[]>

// Summary stats
await getAgentPerformanceSummary(
  projectId: string,
  agentType: string,
  days: number = 30
): Promise<{
  totalRecommendations: number
  approvalRate: number
  avgDecisionTime: number
  trendDirection: 'improving' | 'declining' | 'stable'
}>
```

## System 2: Few-Shot Learning

### Goal
Enable agents to learn from past high-quality recommendations by injecting similar successful examples into generation prompts.

### Database Changes

**Extend `AgentRecommendation` table:**
```typescript
AgentRecommendation {
  // ... existing fields (id, agentType, content, humanDecision, etc.)

  // NEW: Learning fields
  embedding: vector(1536)         // pgvector column
  embeddingModel: string          // 'text-embedding-3-small'
  embeddingText: string           // What was embedded (for debugging)
  signalScore: number             // Quality score (0-1)
  retrievalCount: number          // Times used as example
  lastRetrievedAt: Date | null    // When last used
}
```

**Requires pgvector extension:**
```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE INDEX ON agent_recommendation USING ivfflat (embedding vector_cosine_ops);
```

### Signal Score Calculation

**Purpose:** Determine which recommendations are good examples to learn from.

**Formula:**
```typescript
function calculateSignalScore(rec: AgentRecommendation): number {
  let score = 0

  // Decision quality (60% weight)
  if (rec.humanDecision === 'APPROVED' && rec.appliedAt) {
    score += 0.6  // Best: approved and actually executed
  } else if (rec.humanDecision === 'APPROVED') {
    score += 0.4  // Good: approved but not yet executed
  } else if (rec.humanDecision === 'MODIFIED') {
    score += 0.2  // Okay: needed changes but directionally right
  } else {
    return 0      // Don't use rejected recommendations
  }

  // Recency bonus (20% weight) - recent is better
  const daysOld = daysSince(rec.createdAt)
  const recencyScore = Math.max(0, 1 - (daysOld / 90))  // Linear decay over 90 days
  score += recencyScore * 0.2

  // Priority alignment (20% weight)
  if (rec.priority === 'URGENT' || rec.priority === 'HIGH') {
    score += 0.2  // High-priority approvals are valuable examples
  }

  return Math.min(score, 1.0)
}
```

**Updates:**
- Signal score calculated when recommendation is created (initial: 0)
- Recalculated when human decision is recorded
- Recalculated nightly to update recency component

### Embedding Strategy

**What to embed:**
Combine context + recommendation content for semantic similarity:
```typescript
const embeddingText = `
CONTEXT: ${JSON.stringify(recommendation.data.context)}
RECOMMENDATION: ${recommendation.content}
PRIORITY: ${recommendation.priority}
`.trim()
```

**When to generate:**
- On recommendation creation (async, don't block agent)
- Batch backfill for existing recommendations

**Cost optimization:**
- Use `text-embedding-3-small` (cheap, fast, 1536 dimensions)
- Generate once, store forever
- ~$0.02 per 1M tokens (~50k recommendations)

### Few-Shot Retrieval

**Algorithm:**
1. Generate embedding for current context
2. Query pgvector for similar recommendations:
   - Same `agentType`
   - `signalScore >= minThreshold` (default: 0.6)
   - Created within last N days (default: 90)
   - Order by `embedding <-> query_embedding`
   - Limit to top K (default: 10)
3. Format as examples for LLM prompt
4. Track retrieval (`retrievalCount++`, `lastRetrievedAt = now()`)

**Token budget control:**
- `maxExamples` parameter (default: 10)
- Format examples concisely:
  ```
  Example 1:
  Context: SKU X, 5 units left, 2.5 days supply
  Recommendation: Order 50 units from Supplier Y (lead time: 3 days)
  Outcome: Approved and prevented stockout
  ```

### API

```typescript
// Create recommendation with embedding
async function createRecommendationWithEmbedding(
  agentType: string,
  content: string,
  context: Record<string, any>,
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW'
): Promise<AgentRecommendation>

// Find similar high-quality examples
async function findSimilarRecommendations(
  agentType: string,
  queryContext: string,
  options?: {
    minSignalScore?: number    // Default: 0.6
    maxExamples?: number       // Default: 10
    maxDaysOld?: number        // Default: 90
  }
): Promise<AgentRecommendation[]>

// Update signal score after decision
async function updateRecommendationSignal(
  recommendationId: string,
  humanDecision: 'APPROVED' | 'REJECTED' | 'MODIFIED',
  appliedAt?: Date
): Promise<void>

// Backfill embeddings for existing recommendations
async function backfillEmbeddings(
  projectId: string,
  agentType?: string
): Promise<{ processed: number; failed: number }>
```

### Usage Example

```typescript
// inventory-health.ts - BEFORE
const recommendation = await db.insert(agentRecommendation).values({
  agentType: 'inventory-health',
  content: `Order ${qty} units of ${sku.name}`,
  data: { skuId, currentQty, daysSupply },
  priority: 'URGENT'
})

// inventory-health.ts - AFTER (with learning)
import {
  findSimilarRecommendations,
  createRecommendationWithEmbedding
} from '@clayparrish/agent-learning'

// Find similar past stockout situations
const examples = await findSimilarRecommendations(
  'inventory-health',
  `SKU: ${sku.name}, Category: ${sku.category}, Stock: ${currentQty}, Days Supply: ${daysSupply}`,
  { minSignalScore: 0.7, maxExamples: 5 }
)

// Generate recommendation with examples in prompt
const content = await generateWithClaude({
  systemPrompt: 'You are an inventory management assistant.',
  fewShotExamples: examples.map(ex => ({
    context: ex.embeddingText,
    recommendation: ex.content,
    outcome: ex.humanDecision === 'APPROVED' ? 'Approved and resolved issue' : 'Modified before approval'
  })),
  currentSituation: { sku, currentQty, daysSupply, category: sku.category }
})

// Store with embedding
const recommendation = await createRecommendationWithEmbedding(
  'inventory-health',
  content,
  { skuId, currentQty, daysSupply, category: sku.category },
  'URGENT'
)
```

### Expected Impact

**Virtuous cycle:**
- Day 1: Top 5 examples selected from small pool of recommendations
- Day 30: Top 5 selected from larger pool with better approval rates
- Day 90: Top 5 are high-quality, approved recommendations that solved real problems

**Improvement compounds:**
Better examples → Better new recommendations → Better pool → Even better examples

**Target metrics:**
- 30-50% increase in approval rate within 2 weeks
- Reduced override rate (fewer MODIFIED decisions)
- Faster time-to-decision (clearer recommendations)

## System 3: Experiment Framework

### Goal
Validate that changes to agent logic actually improve performance through controlled A/B testing.

### Database Schema

```typescript
AgentExperiment {
  id: string (uuid)
  projectId: string
  agentType: string

  // Experiment metadata
  name: string                    // 'lower-ocr-threshold-test'
  description: string             // What and why
  hypothesis: string              // Expected outcome

  status: 'DRAFT' | 'RUNNING' | 'COMPLETED' | 'CANCELLED'

  // Timing
  startDate: Date
  endDate: Date | null
  targetRecommendations: number   // Run until N recommendations per variant

  // Variant configs
  controlConfig: Record<string, any>      // Current settings
  experimentConfig: Record<string, any>   // New settings to test

  // Results (computed when target reached)
  controlMetrics: {
    count: number
    approvalRate: number
    avgDecisionTime: number
    overrideRate: number
  } | null

  experimentMetrics: {
    count: number
    approvalRate: number
    avgDecisionTime: number
    overrideRate: number
  } | null

  // Statistical analysis
  pValue: number | null           // Two-proportion z-test for approval rate
  isSignificant: boolean | null   // p < 0.05
  winner: 'control' | 'experiment' | 'inconclusive' | null

  createdBy: string
  createdAt: Date
  updatedAt: Date
}
```

**Link to recommendations:**
Add to `AgentRecommendation`:
```typescript
AgentRecommendation {
  // ... existing fields
  experimentId: string | null
  experimentVariant: 'control' | 'experiment' | null
}
```

### Experiment Lifecycle

**1. Create experiment:**
```typescript
const experiment = await createExperiment({
  projectId: 'gt-ims',
  agentType: 'ocr-review',
  name: 'lower-confidence-threshold',
  description: 'Test if lowering OCR confidence threshold from 0.8 to 0.7 catches more errors',
  hypothesis: 'Lower threshold will increase catch rate without excessive false positives',
  controlConfig: { confidenceThreshold: 0.8 },
  experimentConfig: { confidenceThreshold: 0.7 },
  targetRecommendations: 50  // 50 per variant = 100 total
})
```

**2. Agent checks for active experiments:**
```typescript
const activeExperiment = await getActiveExperiment('gt-ims', 'ocr-review')

if (activeExperiment) {
  // Randomly assign 50/50
  const variant = Math.random() < 0.5 ? 'control' : 'experiment'
  const config = variant === 'control'
    ? activeExperiment.controlConfig
    : activeExperiment.experimentConfig

  // Use assigned config
  const threshold = config.confidenceThreshold

  // Create recommendation with experiment tracking
  await createRecommendationWithEmbedding(
    'ocr-review',
    content,
    context,
    priority,
    { experimentId: activeExperiment.id, experimentVariant: variant }
  )
} else {
  // No experiment, use default config
}
```

**3. Monitor progress:**
```typescript
await getExperimentProgress(experimentId)
// Returns: { control: 45, experiment: 48, targetPerVariant: 50 }
```

**4. Analyze results when complete:**
```typescript
await analyzeExperiment(experimentId)
// Calculates:
// - Approval rates per variant
// - Statistical significance (two-proportion z-test)
// - Sets winner and isSignificant flags
```

**5. Review and decide:**
- View results in dashboard
- If experiment wins and is significant → adopt experimentConfig as new default
- If control wins or inconclusive → stick with current approach

### API

```typescript
// Create experiment
async function createExperiment(config: {
  projectId: string
  agentType: string
  name: string
  description: string
  hypothesis: string
  controlConfig: Record<string, any>
  experimentConfig: Record<string, any>
  targetRecommendations: number
}): Promise<AgentExperiment>

// Start experiment (moves from DRAFT to RUNNING)
async function startExperiment(experimentId: string): Promise<void>

// Check for active experiment
async function getActiveExperiment(
  projectId: string,
  agentType: string
): Promise<AgentExperiment | null>

// Get progress
async function getExperimentProgress(experimentId: string): Promise<{
  controlCount: number
  experimentCount: number
  targetPerVariant: number
  percentComplete: number
}>

// Analyze results (auto-runs when target reached)
async function analyzeExperiment(experimentId: string): Promise<{
  controlApprovalRate: number
  experimentApprovalRate: number
  improvement: number  // Percentage point change
  pValue: number
  isSignificant: boolean
  winner: 'control' | 'experiment' | 'inconclusive'
}>

// Cancel experiment
async function cancelExperiment(experimentId: string): Promise<void>
```

### Statistical Significance Testing

**Two-proportion z-test for approval rates:**
```typescript
function calculateSignificance(
  controlApprovals: number,
  controlTotal: number,
  experimentApprovals: number,
  experimentTotal: number
): { pValue: number; isSignificant: boolean } {
  const p1 = controlApprovals / controlTotal
  const p2 = experimentApprovals / experimentTotal
  const pPooled = (controlApprovals + experimentApprovals) / (controlTotal + experimentTotal)

  const se = Math.sqrt(pPooled * (1 - pPooled) * (1/controlTotal + 1/experimentTotal))
  const z = (p2 - p1) / se
  const pValue = 2 * (1 - normalCDF(Math.abs(z)))

  return {
    pValue,
    isSignificant: pValue < 0.05
  }
}
```

**Minimum sample size:** 30 recommendations per variant (industry standard for proportion tests)

### Usage Example

```typescript
// Test: Does including supplier contact info increase approval rate?

const experiment = await createExperiment({
  projectId: 'gt-ims',
  agentType: 'inventory-health',
  name: 'add-supplier-contact-info',
  description: 'Test if including supplier phone number increases approval rate',
  hypothesis: 'Easier to act on = higher approval rate',
  controlConfig: { includeSupplierContact: false },
  experimentConfig: { includeSupplierContact: true },
  targetRecommendations: 50
})

await startExperiment(experiment.id)

// Agent runs as normal, automatically uses experiment config
// After 100 recommendations (50 control, 50 experiment):

const results = await analyzeExperiment(experiment.id)
// Results:
// controlApprovalRate: 65%
// experimentApprovalRate: 82%
// improvement: +17 percentage points
// pValue: 0.023
// isSignificant: true
// winner: 'experiment'

// Decision: Adopt experimentConfig as new default
```

## System 4: AgentKnowledge Layer

### Goal
Enable cross-agent learning by sharing insights across domains. Example: If Menu Report identifies an underperforming item, Inventory Health should adjust reorder points accordingly.

### Database Schema

```typescript
AgentKnowledge {
  id: string (uuid)
  projectId: string

  // Source
  sourceAgentType: string         // Who created this insight
  sourceRecommendationId: string | null  // Optional: link to recommendation

  // Classification
  knowledgeType: string           // 'product-performance' | 'seasonal-pattern' | 'supplier-reliability'
  subject: string                 // What it's about (e.g., 'sku-123', 'ribeye-steak')

  // Content
  insight: string                 // Human-readable insight
  data: Record<string, any>       // Structured data
  confidence: number              // 0-1 (how sure are we?)

  // Lifecycle
  validFrom: Date
  validUntil: Date | null         // Insights can expire
  invalidatedAt: Date | null      // Marked as no longer accurate
  invalidatedReason: string | null

  // Retrieval
  embedding: vector(1536)         // For semantic search
  retrievalCount: number
  lastRetrievedAt: Date | null

  createdAt: Date
  updatedAt: Date
}
```

### Knowledge Types

**Product Performance:**
```typescript
{
  knowledgeType: 'product-performance',
  subject: 'sku-ribeye-16oz',
  insight: 'Ribeye classified as DOG in menu engineering - low margin ($4.20), low sales (15 orders/week)',
  data: {
    quadrant: 'DOG',
    margin: 4.20,
    sales: 15,
    trend: 'declining',
    recommendation: 'reduce inventory, consider menu removal'
  },
  confidence: 0.9,
  validFrom: '2026-01-15',
  validUntil: '2026-02-15'  // Re-evaluate monthly
}
```

**Seasonal Pattern:**
```typescript
{
  knowledgeType: 'seasonal-pattern',
  subject: 'category-grilling-supplies',
  insight: 'Grilling supplies see 3x demand increase April-August',
  data: {
    category: 'grilling',
    peakMonths: [4, 5, 6, 7, 8],
    demandMultiplier: 3.2,
    historicalYears: 3
  },
  confidence: 0.85,
  validFrom: '2026-01-01',
  validUntil: null  // Evergreen until invalidated
}
```

**Supplier Reliability:**
```typescript
{
  knowledgeType: 'supplier-reliability',
  subject: 'supplier-sysco',
  insight: 'Sysco consistently delivers 2 days faster than quoted lead time',
  data: {
    supplierId: 'sysco-123',
    quotedLeadTime: 5,
    actualAvgLeadTime: 3,
    deliveryVariance: 0.8,
    onTimeRate: 0.95
  },
  confidence: 0.8,
  validFrom: '2026-01-20',
  validUntil: null
}
```

### API

```typescript
// Write insight
async function shareKnowledge(
  projectId: string,
  sourceAgentType: string,
  knowledgeType: string,
  subject: string,
  insight: string,
  data: Record<string, any>,
  options?: {
    confidence?: number
    validUntil?: Date
    sourceRecommendationId?: string
  }
): Promise<AgentKnowledge>

// Query insights
async function getRelevantKnowledge(
  projectId: string,
  queryingAgentType: string,
  queryContext: string,
  options?: {
    knowledgeTypes?: string[]      // Filter by type
    minConfidence?: number         // Default: 0.7
    maxInsights?: number           // Default: 3 (token budget)
    includeExpired?: boolean       // Default: false
  }
): Promise<AgentKnowledge[]>

// Invalidate insight
async function invalidateKnowledge(
  knowledgeId: string,
  reason: string
): Promise<void>

// Update confidence (as more data comes in)
async function updateKnowledgeConfidence(
  knowledgeId: string,
  newConfidence: number
): Promise<void>
```

### Usage Example

**Menu Report creates knowledge:**
```typescript
// menu-weekly-report.ts
import { shareKnowledge } from '@clayparrish/agent-learning'

// After analyzing menu performance
const dogItems = items.filter(i => i.quadrant === 'DOG')

for (const item of dogItems) {
  await shareKnowledge(
    'menu-autopilot',
    'menu-weekly-report',
    'product-performance',
    `sku-${item.skuId}`,
    `${item.name} classified as DOG - low margin, low sales`,
    {
      quadrant: 'DOG',
      margin: item.margin,
      sales: item.sales,
      foodCostPercent: item.foodCostPercent
    },
    { confidence: 0.9, validUntil: addDays(new Date(), 30) }
  )
}
```

**Inventory Health queries knowledge:**
```typescript
// inventory-health.ts
import { getRelevantKnowledge } from '@clayparrish/agent-learning'

for (const sku of skusToReview) {
  // Check if other agents have insights about this SKU
  const insights = await getRelevantKnowledge(
    'gt-ims',
    'inventory-health',
    `SKU: ${sku.name}, Category: ${sku.category}`,
    { knowledgeTypes: ['product-performance', 'seasonal-pattern'], maxInsights: 2 }
  )

  // Adjust recommendation based on cross-agent insights
  if (insights.some(i => i.data.quadrant === 'DOG')) {
    // Lower reorder point for underperforming items
    recommendedQty = Math.floor(recommendedQty * 0.5)
    reasoning += '\nNote: Menu analysis shows this item is underperforming (low margin, low sales)'
  }

  if (insights.some(i => i.knowledgeType === 'seasonal-pattern' && isInPeakSeason(i))) {
    // Increase reorder point for seasonal items
    recommendedQty = Math.floor(recommendedQty * insights[0].data.demandMultiplier)
    reasoning += '\nNote: Seasonal demand pattern detected - adjusting for peak season'
  }
}
```

### Token Budget Control

**Insight formatting:**
Keep insights concise when injecting into prompts:
```typescript
function formatInsightsForPrompt(insights: AgentKnowledge[]): string {
  return insights.map(i =>
    `[${i.sourceAgentType}] ${i.insight} (confidence: ${Math.round(i.confidence * 100)}%)`
  ).join('\n')
}

// Output:
// [menu-weekly-report] Ribeye classified as DOG - low margin, low sales (confidence: 90%)
// [seasonal-analysis] Grilling supplies see 3x demand April-August (confidence: 85%)
```

**Default limit:** 3 insights per recommendation (configurable via `maxInsights`)

## Migration Strategy

### Phase 1: Package Setup
1. Create `@clayparrish/agent-learning` package
2. Define all schemas (existing + new)
3. Build core utilities (embeddings, similarity, metrics)
4. Publish to npm or local registry

### Phase 2: GT-IMS Integration
1. Run migrations (add pgvector, new tables, extend existing tables)
2. Update `inventory-health.ts` to use few-shot learning
3. Update `monday-briefing.ts` to query metrics
4. Deploy and monitor

### Phase 3: Backfill & Tune
1. Backfill embeddings for existing recommendations
2. Wait 2 weeks to collect new recommendations with learning enabled
3. Analyze approval rate changes
4. Tune `minSignalScore` and `maxExamples` based on results

### Phase 4: Experiments
1. Create first experiment (e.g., test different signal score thresholds)
2. Run to completion
3. Validate statistical analysis
4. Adopt winning variant

### Phase 5: Cross-Agent Intelligence
1. Implement AgentKnowledge table
2. Update Menu Autopilot agents to share insights
3. Update GT-IMS agents to query insights
4. Monitor cross-agent coordination

### Phase 6: Expand to Menu Autopilot
1. Run migrations
2. Update OCR Review and Menu Weekly Report agents
3. Enable cross-project knowledge sharing (Menu ↔ GT-IMS)

### Phase 7: Expand to SidelineIQ
1. Run migrations
2. Integrate Marketing and Curriculum agents
3. Different patterns (content generation vs. operational alerts) may need custom adaptations

## Technical Considerations

### pgvector Setup

**Enable extension:**
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

**Index strategy:**
```sql
-- IVFFlat index for fast approximate nearest neighbor search
CREATE INDEX agent_recommendation_embedding_idx
ON agent_recommendation
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Partial index for active recommendations only
CREATE INDEX agent_recommendation_embedding_active_idx
ON agent_recommendation
USING ivfflat (embedding vector_cosine_ops)
WHERE embedding IS NOT NULL AND "humanDecision" = 'APPROVED';
```

**Query performance:**
- IVFFlat index: ~10ms for similarity search at 10k recommendations
- Scales to ~100k recommendations before needing more advanced indexing (HNSW)

### Embedding Generation

**Service:** OpenAI `text-embedding-3-small`
- Dimensions: 1536
- Cost: $0.02 / 1M tokens
- Speed: ~100ms per embedding

**Batch processing:**
- Generate embeddings async (don't block agent execution)
- Queue: Recommendation created → background job → generate embedding → update record
- Retry logic for API failures

**Backfill strategy:**
```typescript
// Generate embeddings for existing recommendations in batches
const unembedded = await db.query.agentRecommendation.findMany({
  where: eq(agentRecommendation.embedding, null),
  limit: 100
})

for (const batch of chunk(unembedded, 10)) {
  await Promise.all(batch.map(rec => generateAndStoreEmbedding(rec.id)))
  await sleep(1000)  // Rate limit
}
```

### Error Handling

**Embedding generation failures:**
- Don't block recommendation creation
- Log error, continue without embedding
- Retry in background job
- Alert after 3 failed attempts

**Similarity search failures:**
- Fall back to rule-based recommendations
- Log warning (learning disabled temporarily)
- Don't break agent execution

**OpenAI API outages:**
- Cache recent embeddings
- Fall back to rule-based generation
- Queue embedding generation for later

## Monitoring & Observability

### Key Metrics to Track

**Learning system health:**
- Embedding generation success rate
- Average similarity search latency
- Few-shot retrieval rate (% of recommendations using examples)
- Signal score distribution

**Agent performance:**
- Approval rate trend (before/after learning enabled)
- Time-to-decision trend
- Override rate trend
- Recommendation volume

**Experiment health:**
- Active experiments count
- Experiment completion rate
- Average time to reach target sample size
- Significant results ratio

### Dashboards

**Agent Performance Dashboard:**
- Approval rate over time (line chart)
- Recommendations per day (bar chart)
- Priority distribution (pie chart)
- Top performing agents (table)

**Learning System Dashboard:**
- Embeddings generated per day
- Few-shot retrieval hit rate
- Signal score distribution
- Top retrieved recommendations

**Experiment Dashboard:**
- Active experiments (list)
- Recent completions (table with results)
- Adoption rate (% of significant experiments adopted)

## Security & Privacy

### Embedding Data
- Embeddings contain semantic meaning of recommendations
- Ensure proper access controls on `AgentRecommendation` table
- Consider excluding sensitive fields from `embeddingText`

### Cross-Project Knowledge
- Knowledge is scoped to `projectId` by default
- Carefully consider cross-project knowledge sharing
- May need approval workflow for sharing insights between projects

### Experiment Data
- Experiments reveal agent logic and business rules
- Limit access to experiment results to authorized users

## Cost Projections

### Embedding Generation
- 50 recommendations/week/agent × 4 agents = 200 recs/week
- Average embedding text: 500 tokens
- Cost: 200 × 500 tokens / 1M × $0.02 = $0.002/week
- **Annual cost: ~$0.10** (negligible)

### LLM Generation with Few-Shot
- 10 examples × 100 tokens/example = 1000 additional tokens per recommendation
- Assuming Claude Sonnet 3.5: ~$3/MTok input
- Cost increase: 1000 × $3 / 1M = $0.003 per recommendation
- 200 recs/week × $0.003 = $0.60/week
- **Annual cost: ~$30** (minimal increase)

### Database Storage
- 1536 dimensions × 4 bytes/float = 6KB per embedding
- 10,000 recommendations × 6KB = 60MB
- Negligible storage cost on modern Postgres

### Total Additional Cost
**~$30-50/year** for learning systems across all projects

## Success Metrics

### Phase 1 Success (Metrics + Few-Shot Learning)
- Metrics dashboard live and showing data
- Embeddings generated for 100% of new recommendations
- Few-shot learning enabled for all GT-IMS agents
- **Target: 30-50% increase in approval rate within 2 weeks**

### Phase 2 Success (Experiments)
- At least 2 experiments run to completion
- Statistical significance correctly calculated
- One winning experiment adopted as new default
- **Target: Data-driven tuning replaces guess-and-check**

### Phase 3 Success (AgentKnowledge)
- Knowledge shared between Menu Autopilot and GT-IMS
- At least 3 cross-agent insights used in recommendations
- **Target: Agents demonstrably using context from other agents**

### Long-term Success (6 months)
- Approval rates improve by 50-75% across all agents
- Time-to-decision reduced by 30%
- Override rate reduced by 40%
- Agents generate consistently better recommendations without manual tuning

## Open Questions

1. **Multi-tenancy:** If Menu Autopilot becomes multi-tenant SaaS, should knowledge be shared across tenants or isolated?
2. **Human feedback loops:** Should we collect explicit feedback ("This recommendation was helpful: yes/no") or rely on implicit signals (approval/rejection)?
3. **Agent-agent communication:** Should agents directly message each other (e.g., Inventory Health asks Menu Report for product performance) or only via knowledge base?
4. **Experiment ethics:** Should humans know they're part of an experiment? (Transparency vs. bias)
5. **Knowledge expiration:** How to automatically detect when insights are no longer valid? Monitor prediction accuracy?

## Next Steps

1. Review and approve this design
2. Create `@clayparrish/agent-learning` package structure
3. Write database migration scripts
4. Implement System 1 (Metrics) and System 2 (Few-Shot Learning)
5. Deploy to GT-IMS staging environment
6. Run for 2 weeks and measure impact
7. Iterate and expand to other systems/projects

---

**End of Design Document**
