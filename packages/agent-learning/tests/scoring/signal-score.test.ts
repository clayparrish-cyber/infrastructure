import { describe, it, expect } from 'vitest'
import { calculateSignalScore } from '../../src/scoring/signal-score'

describe('Signal Score Calculation', () => {
  it('should calculate score for approved critical signal (recent)', () => {
    const score = calculateSignalScore({
      decision: 'approved',
      priority: 'critical',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24) // 1 day ago
    })
    // 0.6 × 1.0 (approved) + 0.2 × 0.967 (1 day decay) + 0.2 × 1.0 (critical)
    expect(score).toBeCloseTo(0.993, 2)
  })

  it('should calculate score for modified high priority signal', () => {
    const score = calculateSignalScore({
      decision: 'modified',
      priority: 'high',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7) // 7 days ago
    })
    // 0.6 × 0.5 (modified) + 0.2 × 0.797 + 0.2 × 0.75
    expect(score).toBeCloseTo(0.609, 2)
  })

  it('should calculate score for rejected low priority signal', () => {
    const score = calculateSignalScore({
      decision: 'rejected',
      priority: 'low',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30) // 30 days ago
    })
    // 0.6 × 0.0 + 0.2 × 0.368 + 0.2 × 0.25
    expect(score).toBeCloseTo(0.124, 2)
  })

  it('should calculate score for modified medium priority', () => {
    const score = calculateSignalScore({
      decision: 'modified',
      priority: 'medium',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14) // 14 days ago
    })
    // 0.6 × 0.5 + 0.2 × 0.619 + 0.2 × 0.5
    expect(score).toBeCloseTo(0.524, 2)
  })

  it('should handle very old signals (90 days)', () => {
    const score = calculateSignalScore({
      decision: 'approved',
      priority: 'critical',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 90) // 90 days ago
    })
    // Recency should decay significantly: 0.6 × 1.0 + 0.2 × ~0.05 + 0.2 × 1.0 ≈ 0.81
    expect(score).toBeCloseTo(0.81, 1)
    expect(score).toBeLessThan(0.82) // Much lower than recent signals
  })
})
