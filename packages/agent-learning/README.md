# @clayparrish/agent-learning

Shared agent infrastructure that enables agents to learn from past decisions and improve over time.

## Features

### 1. Metrics Tracking
Track agent performance over time:
- Approval rates
- Decision times
- Override patterns
- Priority-based segmentation

### 2. Few-Shot Learning
Learn from past high-quality recommendations:
- Semantic similarity search using pgvector
- Signal scoring (recommendation quality)
- Automatic example injection into prompts

### 3. Experiment Framework
A/B test changes with statistical validation:
- Traffic splitting (control vs. experiment)
- Statistical significance testing
- Variant configuration management

### 4. AgentKnowledge Layer
Cross-agent intelligence sharing:
- Share insights between agents
- Query relevant knowledge for context
- Confidence scoring and expiration

## Installation

```bash
npm install @clayparrish/agent-learning
```

Or for local development:
```bash
cd packages/agent-learning
npm link

cd /path/to/your-project
npm link @clayparrish/agent-learning
```

## Setup

### 1. Database Migration

Run the migration SQL for your project:
```bash
psql your_database < node_modules/@clayparrish/agent-learning/migrations/gt-ims/001_add_embeddings.sql
# ... run remaining migrations
```

### 2. Enable pgvector

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 3. Environment Variables

```bash
OPENAI_API_KEY=your_key_here
DATABASE_URL=postgresql://...
```

## Usage

### Few-Shot Learning

```typescript
import {
  findSimilarRecommendations,
  createRecommendationWithEmbedding
} from '@clayparrish/agent-learning'

// Find similar past recommendations
const examples = await findSimilarRecommendations(
  'inventory-health',
  `SKU: ${sku.name}, Stock: ${currentQty}`,
  { minSignalScore: 0.7, maxExamples: 5 }
)

// Use examples in LLM prompt
const content = await generateRecommendation({
  fewShotExamples: examples,
  currentContext: { sku, currentQty }
})

// Store with embedding
const rec = await createRecommendationWithEmbedding(
  'inventory-health',
  content,
  { skuId: sku.id, currentQty },
  'URGENT'
)
```

### Metrics Tracking

```typescript
import { getMetricsTrend, getAgentPerformanceSummary } from '@clayparrish/agent-learning'

// Get 30-day trend
const metrics = await getMetricsTrend(
  'gt-ims',
  'inventory-health',
  startDate,
  endDate
)

// Get summary stats
const summary = await getAgentPerformanceSummary(
  'gt-ims',
  'inventory-health',
  30
)
// Returns: { approvalRate, avgDecisionTime, trendDirection }
```

### Experiments

```typescript
import {
  createExperiment,
  startExperiment,
  getActiveExperiment,
  analyzeExperiment
} from '@clayparrish/agent-learning'

// Create A/B test
const experiment = await createExperiment({
  projectId: 'gt-ims',
  agentType: 'ocr-review',
  name: 'lower-confidence-threshold',
  controlConfig: { threshold: 0.8 },
  experimentConfig: { threshold: 0.7 },
  targetRecommendations: 50
})

await startExperiment(experiment.id)

// In agent code
const active = await getActiveExperiment('gt-ims', 'ocr-review')
if (active) {
  const variant = Math.random() < 0.5 ? 'control' : 'experiment'
  const config = active[`${variant}Config`]
  // Use config...
}

// When complete
const results = await analyzeExperiment(experiment.id)
// Returns: { approvalRate, pValue, isSignificant, winner }
```

### AgentKnowledge

```typescript
import { shareKnowledge, getRelevantKnowledge } from '@clayparrish/agent-learning'

// Share insight
await shareKnowledge(
  'menu-autopilot',
  'menu-weekly-report',
  'product-performance',
  'sku-ribeye',
  'Ribeye classified as DOG - low margin, low sales',
  { quadrant: 'DOG', margin: 4.20, sales: 15 },
  { confidence: 0.9, validUntil: addDays(new Date(), 30) }
)

// Query insights
const insights = await getRelevantKnowledge(
  'gt-ims',
  'inventory-health',
  `SKU: ${sku.name}`,
  { knowledgeTypes: ['product-performance'], maxInsights: 2 }
)
```

## Architecture

See [design document](../../docs/plans/2026-01-22-agent-learning-systems-design.md) for full architecture details.

**Key principles:**
- Additive only (extends existing tables, doesn't break functionality)
- Token budget conscious (configurable limits on examples/insights)
- pgvector for semantic search (scales to 100k+ recommendations)
- Statistical rigor in experiments (two-proportion z-test)

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Test
npm test
```

## Projects Using This Package

- GT-IMS (Inventory Health, Monday Briefing)
- Menu Autopilot (OCR Review, Menu Weekly Report)
- SidelineIQ (Marketing, Curriculum)

## License

Private - Clay Parrish
