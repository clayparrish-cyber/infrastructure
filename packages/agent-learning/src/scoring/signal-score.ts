export type DecisionType = 'approved' | 'modified' | 'rejected'
export type PriorityLevel = 'critical' | 'high' | 'medium' | 'low'

export interface SignalInput {
  decision: DecisionType
  priority: PriorityLevel
  createdAt: Date
}

// Component weights for signal score calculation
const DECISION_WEIGHT_COEFFICIENT = 0.6
const RECENCY_WEIGHT_COEFFICIENT = 0.2
const PRIORITY_WEIGHT_COEFFICIENT = 0.2

// Recency decay constant (days). Score decays to ~37% after this many days.
const RECENCY_DECAY_DAYS = 30

// Milliseconds in one day
const MS_PER_DAY = 1000 * 60 * 60 * 24

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
 * Recency uses exponential decay: e^(-days/30)
 * After 30 days, the recency component decays to ~37% of its original value.
 *
 * @param input Signal data with decision, priority, and creation date
 * @returns Score between 0 and 1 indicating signal quality
 * @throws Error if createdAt is a future date or invalid
 */
export function calculateSignalScore(input: SignalInput): number {
  // Validate date
  if (isNaN(input.createdAt.getTime())) {
    throw new Error('Invalid date provided for signal creation time')
  }

  const decisionWeight = DECISION_WEIGHTS[input.decision]
  const priorityWeight = PRIORITY_WEIGHTS[input.priority]

  // Calculate recency score using exponential decay
  const ageInDays = (Date.now() - input.createdAt.getTime()) / MS_PER_DAY

  // Validate that date is not in the future
  if (ageInDays < 0) {
    throw new Error('Signal creation date cannot be in the future')
  }

  const recencyScore = Math.exp(-ageInDays / RECENCY_DECAY_DAYS)

  // Weighted combination
  const score =
    (DECISION_WEIGHT_COEFFICIENT * decisionWeight) +
    (RECENCY_WEIGHT_COEFFICIENT * recencyScore) +
    (PRIORITY_WEIGHT_COEFFICIENT * priorityWeight)

  return score
}
