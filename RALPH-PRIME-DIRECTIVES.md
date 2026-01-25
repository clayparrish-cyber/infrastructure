# RALPH MISSION: Implement Agent Prime Directives

## STATUS: ✅ COMPLETED (2026-01-23)

All success criteria met. Prime directives enforced across agent infrastructure.

---

## PRIME DIRECTIVE

Add guardrails to prevent agent drift. Create a directive checking system that flags recommendations when agents violate their rules.

## SUCCESS CRITERIA

Output `<promise>PRIME DIRECTIVES ENFORCED</promise>` when ALL conditions are met:

1. `prime-directives.ts` config file created with universal + agent-specific rules
2. `checkDirectives()` function added to agent-learning package
3. Schema updated with `needsVerification`, `violationReason`, `confidence`, `dataSources` fields
4. `inventory-health.ts` updated to use directive checking
5. Flagged recommendations show violation reason in output
6. All existing tests pass
7. TypeScript compiles without errors

## DESIGN DOC

Read the full design: `docs/plans/2026-01-23-agent-prime-directives-design.md`

## KEY DECISIONS

| Decision | Choice |
|----------|--------|
| Enforcement | Flag for human review (soft enforcement) |
| Storage | Centralized config file |
| Concerns | Accuracy drift, scope creep, over-confidence |

## FILE LOCATIONS

| File | Path |
|------|------|
| Config file | `infrastructure/config/agents/prime-directives.ts` |
| Checker function | `infrastructure/packages/agent-learning/src/directives/check.ts` |
| Types | `infrastructure/packages/agent-learning/src/directives/types.ts` |
| Inventory agent | `~/Projects/Internal Systems/gt-ims/scripts/agents/inventory-health.ts` |
| Schema | `~/Projects/Internal Systems/gt-ims/prisma/schema.prisma` |

## IMPLEMENTATION

### Step 1: Create Types

`packages/agent-learning/src/directives/types.ts`:
```typescript
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
```

### Step 2: Create Config

`config/agents/prime-directives.ts`:
```typescript
import type { Directive } from '@clayparrish/agent-learning'

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
      check: () => false,
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

### Step 3: Create Checker Function

`packages/agent-learning/src/directives/check.ts`:
```typescript
import { universalDirectives, agentDirectives } from '../../../config/agents/prime-directives'
import type { DirectiveContext, Violation } from './types'

export function checkDirectives(context: DirectiveContext): Violation[] {
  const violations: Violation[] = []

  for (const directive of universalDirectives) {
    if (directive.check(context)) {
      violations.push({
        directiveId: directive.id,
        rule: directive.rule,
        severity: directive.severity,
      })
    }
  }

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

### Step 4: Update Package Exports

`packages/agent-learning/src/index.ts`:
```typescript
export * from './directives/types'
export * from './directives/check'
// ... existing exports
```

### Step 5: Update Schema

Add to `AgentRecommendation` in GT-IMS schema:
```prisma
model AgentRecommendation {
  // ... existing fields

  needsVerification  Boolean  @default(false)
  violationReason    String?
  confidence         Float?
  dataSources        String[]
}
```

### Step 6: Update Inventory Agent

In `inventory-health.ts`:
```typescript
import { checkDirectives } from '@clayparrish/agent-learning'

// Before creating recommendation
const violations = checkDirectives({
  agentType: 'INVENTORY',
  recommendation: issue,
  sources: latestSnapshot ? [`inventory_snapshot_${latestSnapshot.asOfTimestamp.toISOString().split('T')[0]}`] : [],
  confidence: 0.85,
  dataAge: latestSnapshot ? daysSince(latestSnapshot.asOfTimestamp) : 999,
  demandSource: 'fallback', // Will flag until dynamic demand implemented
  reasoning: issue.recommendation,
})

const violationReason = violations.map(v => v.rule).join('; ')

await prisma.agentRecommendation.create({
  data: {
    ...recommendationData,
    needsVerification: violations.length > 0,
    violationReason: violationReason || null,
    confidence: 0.85,
    dataSources: latestSnapshot ? [`inventory_snapshot`] : [],
  },
})
```

## VERIFICATION COMMANDS

```bash
# 1. Package builds
cd ~/Projects/infrastructure/packages/agent-learning && npm run build

# 2. Package tests pass
cd ~/Projects/infrastructure/packages/agent-learning && npm test

# 3. GT-IMS schema updated
cd ~/Projects/Internal\ Systems/gt-ims && npx prisma generate

# 4. GT-IMS builds
cd ~/Projects/Internal\ Systems/gt-ims && npm run build

# 5. Run agent to verify violations logged
cd ~/Projects/Internal\ Systems/gt-ims && npx tsx scripts/agents/inventory-health.ts
```

## CONSTRAINTS

- DO NOT change enforcement from "flag" to "block"
- DO NOT remove existing agent functionality
- Violations should be warnings, not errors (agent still creates recommendations)
- Keep directive config readable and auditable

## ITERATION STRATEGY

1. First iteration: Create types and directive config
2. Second iteration: Create checkDirectives function
3. Third iteration: Update package exports, rebuild package
4. Fourth iteration: Update Prisma schema with new fields
5. Fifth iteration: Update inventory-health.ts to use directive checking
6. Sixth iteration: Verify all tests pass

## COMPLETION PROMISE

When prime directives are enforced:
```
<promise>PRIME DIRECTIVES ENFORCED</promise>
```
