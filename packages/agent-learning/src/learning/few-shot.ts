import type { SimilarRecommendation } from './similarity'

/**
 * Format similar recommendations as few-shot examples for LLM prompt.
 *
 * Keeps format concise to manage token budget (~100 chars per example).
 * Extracts context from embeddingText and formats with numbered examples.
 *
 * @param recommendations Array of similar recommendations from similarity search
 * @returns Formatted string ready for LLM prompt, or empty string if no recommendations
 */
export function formatExamplesForPrompt(
  recommendations: SimilarRecommendation[]
): string {
  if (recommendations.length === 0) {
    return ''
  }

  return recommendations
    .map((rec, index) => {
      // Extract context from embeddingText (it's the line after "CONTEXT:")
      const contextMatch = rec.embeddingText.match(/CONTEXT:\s*(.+?)(?:\n|$)/s)
      const context = contextMatch?.[1]?.substring(0, 100) || 'N/A'

      // Determine outcome description
      let outcome = 'Pending decision'
      if (rec.humanDecision === 'APPROVED') {
        outcome = 'Approved and executed'
      } else if (rec.humanDecision === 'MODIFIED') {
        outcome = 'Modified before approval'
      } else if (rec.humanDecision === 'REJECTED') {
        outcome = 'Rejected'
      }

      return `Example ${index + 1}:
Context: ${context}
Recommendation: ${rec.content}
Outcome: ${outcome}`
    })
    .join('\n\n---\n\n')
}

/**
 * Extract signal score and similarity summary for debugging/logging.
 * Useful for understanding the quality of retrieved examples.
 *
 * @param recommendations Array of similar recommendations
 * @returns Quality metrics (averages and count)
 */
export function summarizeExampleQuality(
  recommendations: SimilarRecommendation[]
): {
  avgSignalScore: number
  avgSimilarity: number
  count: number
} {
  if (recommendations.length === 0) {
    return { avgSignalScore: 0, avgSimilarity: 0, count: 0 }
  }

  const avgSignalScore =
    recommendations.reduce((sum, r) => sum + r.signalScore, 0) /
    recommendations.length

  const avgSimilarity =
    recommendations.reduce((sum, r) => sum + r.similarity, 0) /
    recommendations.length

  return {
    avgSignalScore,
    avgSimilarity,
    count: recommendations.length,
  }
}
