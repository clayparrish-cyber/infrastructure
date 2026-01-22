export type DecisionType = 'approved' | 'modified' | 'rejected'
export type PriorityLevel = 'critical' | 'high' | 'medium' | 'low'

export interface SignalInput {
  decision: DecisionType
  priority: PriorityLevel
  createdAt: Date
}

/**
 * Decision quality weights for signal scoring.
 * Approved recommendations are most valuable, rejected are least.
 */
const DECISION_WEIGHTS: Record<DecisionType, number> = {
  approved: 1.0,
  modified: 0.5,
  rejected: 0.0,
}

/**
 * Priority level weights for signal scoring.
 * Critical issues are most important.
 */
const PRIORITY_WEIGHTS: Record<PriorityLevel, number> = {
  critical: 1.0,
  high: 0.75,
  medium: 0.5,
  low: 0.25,
}

/**
 * Calculate signal score using weighted formula:
 * score = (0.6 × decision_weight) + (0.2 × recency_score) + (0.2 × priority_score)
 *
 * Recency uses exponential decay: e^(-days/30) with 30-day half-life
 *
 * @param input Signal data with decision, priority, and creation date
 * @returns Score between 0 and 1 indicating signal quality
 */
export function calculateSignalScore(input: SignalInput): number {
  const decisionWeight = DECISION_WEIGHTS[input.decision]
  const priorityWeight = PRIORITY_WEIGHTS[input.priority]

  // Calculate recency score using exponential decay
  const ageInDays = (Date.now() - input.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  const recencyScore = Math.exp(-ageInDays / 30)

  // Weighted combination: 60% decision, 20% recency, 20% priority
  const score = (0.6 * decisionWeight) + (0.2 * recencyScore) + (0.2 * priorityWeight)

  return score
}
