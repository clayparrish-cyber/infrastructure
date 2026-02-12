/**
 * Directive Checking
 *
 * Checks agent context against directives and returns violations.
 */

import type { Directive, DirectiveContext, Violation } from './types'

/**
 * Check context against a list of directives
 *
 * @param context - The context to check
 * @param directives - List of directives to check against
 * @returns Array of violations (empty if all checks pass)
 */
export function checkDirectives(
  context: DirectiveContext,
  directives: Directive[]
): Violation[] {
  const violations: Violation[] = []

  for (const directive of directives) {
    try {
      if (directive.check(context)) {
        violations.push({
          directiveId: directive.id,
          rule: directive.rule,
          severity: directive.severity,
        })
      }
    } catch (error) {
      // If a check fails, treat it as a warning violation
      violations.push({
        directiveId: directive.id,
        rule: `Check failed: ${directive.rule}`,
        severity: 'warning',
      })
    }
  }

  return violations
}

/**
 * Check if any violations are errors (not just warnings)
 */
export function hasErrorViolations(violations: Violation[]): boolean {
  return violations.some(v => v.severity === 'error')
}

/**
 * Format violations as a human-readable string
 */
export function formatViolations(violations: Violation[]): string {
  if (violations.length === 0) return ''
  return violations.map(v => v.rule).join('; ')
}
