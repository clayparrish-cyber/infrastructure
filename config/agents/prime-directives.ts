/**
 * Agent Prime Directives
 *
 * Centralized configuration for agent guardrails.
 * These directives prevent agent drift by flagging violations for human review.
 */

import type { Directive } from '@clayparrish/agent-learning'

/**
 * Universal directives apply to ALL agents
 */
export const universalDirectives: Directive[] = [
  {
    id: 'cite-source',
    rule: 'Must cite data source for every recommendation',
    check: (ctx) => ctx.sources.length === 0,
    severity: 'error',
  },
  {
    id: 'flag-uncertainty',
    rule: 'Flag when confidence < 80%',
    check: (ctx) => ctx.confidence < 0.8,
    severity: 'warning',
  },
  {
    id: 'human-reasoning',
    rule: 'Include human-readable reasoning',
    check: (ctx) => !ctx.reasoning || ctx.reasoning.length < 20,
    severity: 'warning',
  },
]

/**
 * Agent-specific directives by agent type
 */
export const agentDirectives: Record<string, Directive[]> = {
  INVENTORY: [
    {
      id: 'fresh-data',
      rule: 'Only use inventory snapshots < 7 days old',
      check: (ctx) => (ctx.dataAge ?? 0) > 7,
      severity: 'error',
    },
    {
      id: 'realistic-demand',
      rule: 'Base demand on CRM data or explicit input',
      check: (ctx) => ctx.demandSource === 'fallback',
      severity: 'warning',
    },
  ],
  LEGAL: [
    {
      id: 'no-advice',
      rule: 'Never provide legal advice, only flag for review',
      check: () => false, // Content analysis would be needed
      severity: 'error',
    },
  ],
  RESEARCH: [
    {
      id: 'cite-sources',
      rule: 'Always cite external sources',
      check: (ctx) => ctx.sources.filter(s => s.startsWith('http')).length === 0,
      severity: 'error',
    },
  ],
}

/**
 * Get all directives for an agent type (universal + agent-specific)
 */
export function getDirectivesForAgent(agentType: string): Directive[] {
  return [...universalDirectives, ...(agentDirectives[agentType] || [])]
}
