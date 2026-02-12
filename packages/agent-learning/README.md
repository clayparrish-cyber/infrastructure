# @clayparrish/agent-learning

Shared agent infrastructure for learning from past decisions across projects (GT-IMS, Menu Autopilot, SidelineIQ).

## Features

- **Few-Shot Learning**: Find similar past recommendations using pgvector embeddings
- **Signal Scoring**: Weighted quality metrics (60% decision, 20% recency, 20% priority)
- **OpenAI Embeddings**: text-embedding-3-small integration
- **Similarity Search**: IVFFlat indexes for fast vector search

## Quick Start

### 1. Install

```bash
npm install @clayparrish/agent-learning
# or link locally
npm link @clayparrish/agent-learning
```

### 2. Set environment variables

```bash
OPENAI_API_KEY=sk-...
DATABASE_URL=postgresql://...
```

### 3. Use in your agent

```typescript
import {
  generateEmbedding,
  findSimilarRecommendations,
  formatExamplesForPrompt,
  calculateSignalScore,
  createConnection,
} from '@clayparrish/agent-learning'

// Connect to database
const sql = createConnection(process.env.DATABASE_URL!)

// Generate embedding for current context
const embedding = await generateEmbedding({
  text: 'Low stock on Strawberry Cardamom PB&J',
  apiKey: process.env.OPENAI_API_KEY!,
})

// Find similar past recommendations
const examples = await findSimilarRecommendations(sql, {
  agentType: 'INVENTORY_HEALTH',
  queryEmbedding: embedding,
  minSignalScore: 0.6,
  maxExamples: 5,
})

// Format for LLM prompt
const fewShotPrompt = formatExamplesForPrompt(examples)

// Calculate quality score after human decision
const score = calculateSignalScore({
  decision: 'approved',
  priority: 'critical',
  createdAt: new Date(Date.now() - 86400000), // 1 day ago
})
```

## Phase 1 Status

✅ **Few-Shot Learning** - Embeddings + similarity search
✅ **Signal Scoring** - Weighted quality metrics
⏳ **Metrics Tracking** - Daily aggregation (Phase 2)
⏳ **Experiment Framework** - A/B testing (Phase 2)
⏳ **AgentKnowledge Layer** - Cross-agent learning (Phase 3)

## Architecture

**Hub-and-Spoke Model:**
- Central package (`@clayparrish/agent-learning`) provides shared infrastructure
- Individual projects (GT-IMS, Menu Autopilot, SidelineIQ) integrate as needed
- PostgreSQL with pgvector for vector similarity search
- OpenAI text-embedding-3-small for embeddings

## License

UNLICENSED (Private)
