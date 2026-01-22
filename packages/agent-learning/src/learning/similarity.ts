import type postgres from 'postgres'

type Sql = ReturnType<typeof postgres>

const EXPECTED_EMBEDDING_DIMENSIONS = 1536

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

interface DatabaseRow {
  id: string
  agentType: string
  content: string
  embeddingText: string
  signalScore: string | number
  humanDecision: string
  priority: string
  createdAt: Date | string
  similarity: string | number
}

/**
 * Find similar recommendations using pgvector cosine similarity
 *
 * @param sql - Postgres connection
 * @param options - Search parameters
 * @returns Array of similar recommendations ordered by similarity
 * @throws Error if embedding is invalid or database query fails
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

  // Validate embedding dimensions
  if (!queryEmbedding || queryEmbedding.length !== EXPECTED_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Query embedding must have ${EXPECTED_EMBEDDING_DIMENSIONS} dimensions, got ${queryEmbedding?.length || 0}`
    )
  }

  // Validate maxExamples
  if (maxExamples <= 0) {
    throw new Error('maxExamples must be greater than 0')
  }

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - maxDaysOld)

  // Convert embedding array to pgvector format
  const embeddingVector = `[${queryEmbedding.join(',')}]`

  try {
    const results = await sql<DatabaseRow[]>`
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

    return results.map((row: DatabaseRow) => ({
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
  } catch (error) {
    throw new Error(
      `Failed to find similar recommendations: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Track that a recommendation was used as a few-shot example.
 * Updates retrievalCount and lastRetrievedAt timestamp.
 *
 * @param sql - Postgres connection
 * @param recommendationId - ID of recommendation to track
 * @throws Error if update fails
 */
export async function trackRetrieval(
  sql: Sql,
  recommendationId: string
): Promise<void> {
  try {
    await sql`
      UPDATE agent_recommendations
      SET
        "retrievalCount" = "retrievalCount" + 1,
        "lastRetrievedAt" = NOW()
      WHERE id = ${recommendationId}
    `
  } catch (error) {
    throw new Error(
      `Failed to track retrieval for recommendation ${recommendationId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
