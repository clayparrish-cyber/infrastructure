import { describe, it, expect, vi } from 'vitest'
import { findSimilarRecommendations } from '../../src/learning/similarity'

type MockRow = {
  id: string
  agentType: string
  content: string
  embeddingText: string
  signalScore: string | number
  humanDecision: string
  priority: string
  createdAt: string
  similarity: string | number
}

function makeSqlMock(rows: MockRow[]) {
  return vi.fn(async () => rows)
}

describe('Similarity Search', () => {
  it('should find similar recommendations by embedding', async () => {
    const queryEmbedding = new Array(1536).fill(0.1)
    const sql = makeSqlMock([
      {
        id: 'rec-1',
        agentType: 'INVENTORY_HEALTH',
        content: 'restock strawberry cardamom',
        embeddingText: 'low stock strawberry cardamom',
        signalScore: '0.82',
        humanDecision: 'approved',
        priority: 'high',
        createdAt: new Date().toISOString(),
        similarity: '0.11',
      },
    ])

    const results = await findSimilarRecommendations(sql as any, {
      agentType: 'INVENTORY_HEALTH',
      queryEmbedding,
      minSignalScore: 0.6,
      maxExamples: 5,
      maxDaysOld: 90,
    })

    expect(Array.isArray(results)).toBe(true)
    expect(results).toHaveLength(1)
  })

  it('should map numeric/string fields to numbers', async () => {
    const queryEmbedding = new Array(1536).fill(0.1)
    const sql = makeSqlMock([
      {
        id: 'rec-2',
        agentType: 'BRIEFING',
        content: 'monday briefing focus',
        embeddingText: 'weekly summary',
        signalScore: '0.91',
        humanDecision: 'approved',
        priority: 'medium',
        createdAt: new Date().toISOString(),
        similarity: '0.23',
      },
    ])

    const results = await findSimilarRecommendations(sql as any, {
      agentType: 'BRIEFING',
      queryEmbedding,
      maxExamples: 3,
    })

    expect(results[0].agentType).toBe('BRIEFING')
    expect(typeof results[0].signalScore).toBe('number')
    expect(typeof results[0].similarity).toBe('number')
  })

  it('should throw error for invalid embedding dimensions', async () => {
    const sql = makeSqlMock([])
    const invalidEmbedding = new Array(512).fill(0.1)

    await expect(findSimilarRecommendations(sql as any, {
      agentType: 'INVENTORY_HEALTH',
      queryEmbedding: invalidEmbedding,
    })).rejects.toThrow('must have 1536 dimensions')
  })

  it('should throw error for zero maxExamples', async () => {
    const queryEmbedding = new Array(1536).fill(0.1)
    const sql = makeSqlMock([])

    await expect(findSimilarRecommendations(sql as any, {
      agentType: 'INVENTORY_HEALTH',
      queryEmbedding,
      maxExamples: 0,
    })).rejects.toThrow('must be greater than 0')
  })
})
