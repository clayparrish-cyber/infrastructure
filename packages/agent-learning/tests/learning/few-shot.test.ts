import { describe, it, expect } from 'vitest'
import { formatExamplesForPrompt, summarizeExampleQuality } from '../../src/learning/few-shot'

describe('Few-Shot Example Formatting', () => {
  const mockRecommendations = [
    {
      id: '1',
      agentType: 'INVENTORY_HEALTH',
      content: 'Order 200 units of Strawberry PB&J from Sysco',
      embeddingText: 'CONTEXT: {"sku":"Strawberry","qty":50,"days":5}\nRECOMMENDATION: Order 200 units',
      signalScore: 0.9,
      humanDecision: 'APPROVED',
      priority: 'URGENT',
      createdAt: new Date(),
      similarity: 0.05,
    },
    {
      id: '2',
      agentType: 'INVENTORY_HEALTH',
      content: 'Order 100 units of Blueberry PB&J from UNFI',
      embeddingText: 'CONTEXT: {"sku":"Blueberry","qty":75,"days":8}\nRECOMMENDATION: Order 100 units',
      signalScore: 0.8,
      humanDecision: 'MODIFIED',
      priority: 'HIGH',
      createdAt: new Date(),
      similarity: 0.08,
    },
  ]

  it('should format recommendations as numbered examples', () => {
    const formatted = formatExamplesForPrompt(mockRecommendations)

    expect(formatted).toContain('Example 1:')
    expect(formatted).toContain('Example 2:')
  })

  it('should include context, recommendation, and outcome', () => {
    const formatted = formatExamplesForPrompt(mockRecommendations)

    expect(formatted).toContain('Context:')
    expect(formatted).toContain('Recommendation:')
    expect(formatted).toContain('Outcome:')
  })

  it('should describe outcome based on decision', () => {
    const formatted = formatExamplesForPrompt(mockRecommendations)

    expect(formatted).toContain('Approved and executed')
    expect(formatted).toContain('Modified before approval')
  })

  it('should be concise for token budget', () => {
    const formatted = formatExamplesForPrompt(mockRecommendations)

    // Each example should be roughly 100-150 chars (conservative estimate)
    const avgLength = formatted.length / mockRecommendations.length
    expect(avgLength).toBeLessThan(200)
  })

  it('should handle empty array', () => {
    const formatted = formatExamplesForPrompt([])
    expect(formatted).toBe('')
  })

  it('should extract context from embeddingText', () => {
    const formatted = formatExamplesForPrompt(mockRecommendations)

    expect(formatted).toContain('Strawberry')
    expect(formatted).toContain('Blueberry')
  })

  it('should summarize example quality metrics', () => {
    const summary = summarizeExampleQuality(mockRecommendations)

    expect(summary.avgSignalScore).toBeCloseTo(0.85, 10) // (0.9 + 0.8) / 2
    expect(summary.avgSimilarity).toBeCloseTo(0.065, 3) // (0.05 + 0.08) / 2
    expect(summary.count).toBe(2)
  })

  it('should handle empty array in quality summary', () => {
    const summary = summarizeExampleQuality([])

    expect(summary.avgSignalScore).toBe(0)
    expect(summary.avgSimilarity).toBe(0)
    expect(summary.count).toBe(0)
  })
})
