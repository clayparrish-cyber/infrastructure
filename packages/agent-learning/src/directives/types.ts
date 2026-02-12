/**
 * Prime Directive Types
 *
 * Types for the agent directive enforcement system that prevents drift.
 */

export interface Directive {
  id: string
  rule: string
  check: (context: DirectiveContext) => boolean
  severity: 'warning' | 'error'
}

export interface DirectiveContext {
  agentType: string
  recommendation: unknown
  sources: string[]
  confidence: number
  dataAge?: number
  demandSource?: string
  reasoning?: string
}

export interface Violation {
  directiveId: string
  rule: string
  severity: 'warning' | 'error'
}
