import type postgres from 'postgres'

type Sql = ReturnType<typeof postgres>

export interface SimilaritySearchOptions {
  agentType: string
  queryEmbedding: number[]
  minSignalScore?: number
  maxExamples?: number
  maxDaysOld?: number
}

export interface SimilarRecommendation {
  id: string
  agentType: string
  content: string
  embeddingText: string
  signalScore: number
  humanDecision: string
  priority: string
  createdAt: Date
  similarity: number
}

/**
 * Find similar recommendations using pgvector cosine similarity
 *
 * @param sql - Postgres connection
 * @param options - Search parameters
 * @returns Array of similar recommendations ordered by similarity
 */
export async function findSimilarRecommendations(
  sql: Sql,
  options: SimilaritySearchOptions
): Promise<SimilarRecommendation[]> {
  const {
    agentType,
    queryEmbedding,
    minSignalScore = 0.6,
    maxExamples = 10,
    maxDaysOld = 90,
  } = options

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - maxDaysOld)

  // Convert embedding array to pgvector format
  const embeddingVector = `[${queryEmbedding.join(',')}]`

  const results = await sql`
    SELECT
      id,
      "agentType",
      recommendation->>'content' as content,
      "embeddingText",
      "signalScore",
      "humanDecision",
      priority,
      "createdAt",
      (embedding <-> ${embeddingVector}::vector) as similarity
    FROM agent_recommendations
    WHERE
      "agentType" = ${agentType}
      AND embedding IS NOT NULL
      AND "signalScore" >= ${minSignalScore}
      AND "createdAt" >= ${cutoffDate}
    ORDER BY embedding <-> ${embeddingVector}::vector
    LIMIT ${maxExamples}
  `

  return results.map((row: any) => ({
    id: row.id,
    agentType: row.agentType,
    content: row.content,
    embeddingText: row.embeddingText,
    signalScore: Number(row.signalScore),
    humanDecision: row.humanDecision,
    priority: row.priority,
    createdAt: new Date(row.createdAt),
    similarity: Number(row.similarity),
  }))
}

/**
 * Track that a recommendation was used as a few-shot example
 */
export async function trackRetrieval(
  sql: Sql,
  recommendationId: string
): Promise<void> {
  await sql`
    UPDATE agent_recommendations
    SET
      "retrievalCount" = "retrievalCount" + 1,
      "lastRetrievedAt" = NOW()
    WHERE id = ${recommendationId}
  `
}
