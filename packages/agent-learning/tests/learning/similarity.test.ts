import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { findSimilarRecommendations } from '../../src/learning/similarity'
import { createConnection, closeConnection } from '../../src/db/connection'

describe('Similarity Search', () => {
  let sql: any

  beforeEach(async () => {
    sql = createConnection(process.env.DATABASE_URL!)
  })

  afterEach(async () => {
    await closeConnection()
  })

  it('should find similar recommendations by embedding', async () => {
    // This test requires seeded data with embeddings
    // For now, just test the query structure doesn't error
    const queryEmbedding = new Array(1536).fill(0.1)

    const results = await findSimilarRecommendations(sql, {
      agentType: 'INVENTORY_HEALTH',
      queryEmbedding,
      minSignalScore: 0.6,
      maxExamples: 5,
      maxDaysOld: 90,
    })

    expect(Array.isArray(results)).toBe(true)
  })

  it('should filter by agent type', async () => {
    const queryEmbedding = new Array(1536).fill(0.1)

    const results = await findSimilarRecommendations(sql, {
      agentType: 'BRIEFING',
      queryEmbedding,
    })

    // All results should be monday-briefing type
    results.forEach(r => {
      expect(r.agentType).toBe('BRIEFING') // Prisma enum value
    })
  })

  it('should limit results to maxExamples', async () => {
    const queryEmbedding = new Array(1536).fill(0.1)

    const results = await findSimilarRecommendations(sql, {
      agentType: 'INVENTORY_HEALTH',
      queryEmbedding,
      maxExamples: 3,
    })

    expect(results.length).toBeLessThanOrEqual(3)
  })

  it('should filter by minimum signal score', async () => {
    const queryEmbedding = new Array(1536).fill(0.1)

    const results = await findSimilarRecommendations(sql, {
      agentType: 'INVENTORY_HEALTH',
      queryEmbedding,
      minSignalScore: 0.8,
    })

    // All results should have score >= 0.8
    results.forEach(r => {
      expect(Number(r.signalScore)).toBeGreaterThanOrEqual(0.8)
    })
  })

  it('should filter by max days old', async () => {
    const queryEmbedding = new Array(1536).fill(0.1)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const results = await findSimilarRecommendations(sql, {
      agentType: 'INVENTORY_HEALTH',
      queryEmbedding,
      maxDaysOld: 30,
    })

    // All results should be within 30 days
    results.forEach(r => {
      expect(new Date(r.createdAt).getTime()).toBeGreaterThan(thirtyDaysAgo.getTime())
    })
  })

  it('should throw error for invalid embedding dimensions', async () => {
    const invalidEmbedding = new Array(512).fill(0.1) // Wrong size

    await expect(findSimilarRecommendations(sql, {
      agentType: 'INVENTORY_HEALTH',
      queryEmbedding: invalidEmbedding,
    })).rejects.toThrow('must have 1536 dimensions')
  })

  it('should throw error for zero maxExamples', async () => {
    const queryEmbedding = new Array(1536).fill(0.1)

    await expect(findSimilarRecommendations(sql, {
      agentType: 'INVENTORY_HEALTH',
      queryEmbedding,
      maxExamples: 0,
    })).rejects.toThrow('must be greater than 0')
  })
})
