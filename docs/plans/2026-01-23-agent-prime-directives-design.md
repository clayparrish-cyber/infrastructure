# Agent Prime Directives Design

**Date:** 2026-01-23
**Status:** RALPH READY
**Goal:** Prevent agent drift by enforcing guardrails on recommendations

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Concerns addressed | Accuracy drift, scope creep, over-confidence | Comprehensive guardrails |
| Enforcement | Flag for human review | Soft enforcement, keeps humans in loop |
| Storage | Centralized config file | Easy to audit and update |

---

## Directive Categories

### 1. Universal Directives (All Agents)

| ID | Rule | Violation Check |
|----|------|-----------------|
| `cite-source` | Must cite data source for every recommendation | `sources.length === 0` |
| `flag-uncertainty` | Flag when confidence < 80% | `confidence < 0.8` |
| `stay-in-domain` | Only recommend within assigned domain | Cross-domain detection |
| `human-reasoning` | Include human-readable reasoning | `!reasoning || reasoning.length < 20` |

### 2. Agent-Specific Directives

**INVENTORY Agent:**
| ID | Rule | Violation Check |
|----|------|-----------------|
| `fresh-data` | Only use inventory snapshots < 7 days old | `dataAge > 7` |
| `realistic-demand` | Base demand on CRM data or explicit input | `demandSource === 'hardcoded'` |
| `known-sku` | Only recommend for SKUs in database | `!sku.exists` |

**LEGAL Agent:**
| ID | Rule | Violation Check |
|----|------|-----------------|
| `no-advice` | Never provide legal advice, only flag for review | Content analysis |
| `cite-statute` | Reference specific laws/regulations when flagging | `!statuteRef` |

**RESEARCH Agent:**
| ID | Rule | Violation Check |
|----|------|-----------------|
| `cite-sources` | Always cite external sources | `externalSources.length === 0` |
| `fact-vs-inference` | Distinguish fact from inference | Content tagging |
| `recency` | Flag if sources > 30 days old | `sourceAge > 30` |

---

## Implementation

### Config File Location

`infrastructure/config/agents/prime-directives.ts`

```typescript
export interface Directive {
  id: string
  rule: string
  check: (context: DirectiveContext) => boolean  // Returns true if violated
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
    id: 'stay-in-domain',
    rule: 'Only recommend within assigned domain',
    check: (ctx) => false, // Implemented per-agent
    severity: 'error',
  },
  {
    id: 'human-reasoning',
    rule: 'Include human-readable reasoning',
    check: (ctx) => !ctx.reasoning || ctx.reasoning.length < 20,
    severity: 'warning',
  },
]

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
      check: (ctx) => ctx.demandSource === 'hardcoded',
      severity: 'warning',
    },
  ],
  LEGAL: [
    {
      id: 'no-advice',
      rule: 'Never provide legal advice, only flag for review',
      check: () => false, // Content analysis needed
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
```

### Checker Function

Add to `@clayparrish/agent-learning`:

```typescript
// packages/agent-learning/src/directives/check.ts

import { universalDirectives, agentDirectives, DirectiveContext, Directive } from './config'

export interface Violation {
  directiveId: string
  rule: string
  severity: 'warning' | 'error'
}

export function checkDirectives(context: DirectiveContext): Violation[] {
  const violations: Violation[] = []

  // Check universal directives
  for (const directive of universalDirectives) {
    if (directive.check(context)) {
      violations.push({
        directiveId: directive.id,
        rule: directive.rule,
        severity: directive.severity,
      })
    }
  }

  // Check agent-specific directives
  const agentSpecific = agentDirectives[context.agentType] || []
  for (const directive of agentSpecific) {
    if (directive.check(context)) {
      violations.push({
        directiveId: directive.id,
        rule: directive.rule,
        severity: directive.severity,
      })
    }
  }

  return violations
}
```

### Database Schema Changes

Add to GT-IMS Prisma schema:

```prisma
model AgentRecommendation {
  // ... existing fields

  // Prime directive enforcement
  needsVerification  Boolean  @default(false)
  violationReason    String?
  confidence         Float?   // 0.0 - 1.0
  dataSources        String[] // Sources used for this recommendation
}
```

### Agent Script Integration

Example usage in `inventory-health.ts`:

```typescript
import { checkDirectives } from '@clayparrish/agent-learning'

// Before creating recommendation
const violations = checkDirectives({
  agentType: 'INVENTORY',
  recommendation: issue,
  sources: ['inventory_snapshot_2026-01-20'],
  confidence: 0.85,
  dataAge: latestSnapshot ? daysSince(latestSnapshot.asOfTimestamp) : 999,
  demandSource: 'hardcoded', // Will trigger warning until we fix demand
  reasoning: issue.recommendation,
})

const hasErrors = violations.some(v => v.severity === 'error')
const violationReason = violations.map(v => v.rule).join('; ')

await prisma.agentRecommendation.create({
  data: {
    ...recommendationData,
    needsVerification: violations.length > 0,
    violationReason: violationReason || null,
    confidence: 0.85,
    dataSources: ['inventory_snapshot_2026-01-20'],
  },
})
```

---

## Executive Dashboard Integration

### IDS View - Flagged Recommendations

Recommendations with `needsVerification: true` show:

```
┌─────────────────────────────────────────────────────────────────┐
│ ⚠️ NEEDS VERIFICATION                                           │
│                                                                  │
│ 🟡 HIGH  GT-IMS  Inventory reorder recommendation               │
│                                                                  │
│ Violations:                                                      │
│ • Base demand on CRM data or explicit input (using hardcoded)   │
│                                                                  │
│ [Approve Anyway] [Reject] [Request More Info]                   │
└─────────────────────────────────────────────────────────────────┘
```

### Learning from Overrides

When humans approve despite violations:
- Signal score still calculated normally
- System learns which directives are "soft" vs "hard"
- Over time, can adjust severity based on approval patterns

---

## Success Criteria

**Ralph Complete When:**

1. [ ] `prime-directives.ts` config file created with universal + agent-specific rules
2. [ ] `checkDirectives()` function added to agent-learning package
3. [ ] `needsVerification`, `violationReason`, `confidence`, `dataSources` fields added to schema
4. [ ] `inventory-health.ts` updated to use directive checking
5. [ ] All existing tests pass
6. [ ] TypeScript compiles without errors

---

## Future Enhancements

- **Directive analytics**: Track which directives are most violated
- **Auto-severity adjustment**: Learn from approval patterns
- **Custom directives per venture**: Allow ventures to add their own rules
- **Directive versioning**: Track when directives change, audit history
