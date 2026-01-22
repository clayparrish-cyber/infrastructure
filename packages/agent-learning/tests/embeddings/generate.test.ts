import { describe, it, expect, beforeEach, vi } from 'vitest'
import { generateEmbedding, generateEmbeddings } from '../../src/embeddings/generate'

// Mock OpenAI client
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    embeddings: {
      create: vi.fn().mockImplementation(async (params) => {
        const inputs = Array.isArray(params.input) ? params.input : [params.input]
        return {
          data: inputs.map(() => ({ embedding: new Array(1536).fill(0.1) })),
        }
      }),
    },
  })),
}))

describe('Embedding Generation', () => {
  it('should generate embedding for single text', async () => {
    const embedding = await generateEmbedding({
      text: 'Low stock on Strawberry Cardamom',
      apiKey: 'test-key',
    })

    expect(embedding).toHaveLength(1536)
    expect(embedding[0]).toBe(0.1)
  })

  it('should generate embeddings for multiple texts', async () => {
    const embeddings = await generateEmbeddings({
      texts: [
        'Low stock on Strawberry Cardamom',
        'High velocity on Blueberry Lemon Thyme',
      ],
      apiKey: 'test-key',
    })

    expect(embeddings).toHaveLength(2)
    expect(embeddings[0]).toHaveLength(1536)
    expect(embeddings[1]).toHaveLength(1536)
  })

  it('should throw error for empty text', async () => {
    await expect(generateEmbedding({
      text: '',
      apiKey: 'test-key',
    })).rejects.toThrow('Text cannot be empty')
  })

  it('should throw error for missing API key', async () => {
    await expect(generateEmbedding({
      text: 'Some text',
      apiKey: '',
    })).rejects.toThrow('OpenAI API key is required')
  })
})
