# RALPH MISSION: Implement Dynamic Demand Forecasting

## PRIME DIRECTIVE

Replace hardcoded `estimatedDailyDemand = 10` with a dynamic system that uses real sales data (post-launch) or CRM projections (pre-launch).

## SUCCESS CRITERIA

Output `<promise>DYNAMIC DEMAND IMPLEMENTED</promise>` when ALL conditions are met:

1. `SalesData` model added to Prisma schema
2. `getDemandForSku()` function created that checks sales → CRM → fallback
3. `inventory-health.ts` updated to use dynamic demand
4. CSV import endpoint created for sales data
5. Agent correctly falls back to CRM velocity when no sales data
6. Agent flags recommendations using fallback demand as `needsVerification`
7. All existing tests pass
8. TypeScript compiles without errors

## DESIGN DOC

Read the full design: `docs/plans/2026-01-23-dynamic-demand-design.md`

## KEY DECISIONS

| Decision | Choice |
|----------|--------|
| Pre-launch source | CRM LIVE opportunities (velocity × doors) |
| Post-launch source | Distributor sales data (SalesData table) |
| Fallback | Hardcoded 10 units/day with needsVerification flag |

## CONTEXT

- GT launches Feb/March 2026
- Pre-launch: Only CRM projections available
- Post-launch: Sales data from KEHE, UNFI, retailers

## FILE LOCATIONS

| File | Path |
|------|------|
| Schema | `~/Projects/Internal Systems/gt-ims/prisma/schema.prisma` |
| Demand lib | `~/Projects/Internal Systems/gt-ims/src/lib/demand.ts` |
| Import API | `~/Projects/Internal Systems/gt-ims/src/app/api/sales-data/import/route.ts` |
| Inventory agent | `~/Projects/Internal Systems/gt-ims/scripts/agents/inventory-health.ts` |

## IMPLEMENTATION

### Step 1: Add SalesData Model

Add to `prisma/schema.prisma`:
```prisma
model SalesData {
  id            String   @id @default(cuid())

  skuId         String
  sku           Sku      @relation(fields: [skuId], references: [id])

  source        String   // "KEHE", "UNFI", "retailer-name"
  locationCode  String?

  periodStart   DateTime
  periodEnd     DateTime
  unitsSold     Int
  periodType    String   // "WEEKLY", "MONTHLY"

  importedAt    DateTime @default(now())
  importSource  String   // "csv_upload", "edi_feed"

  @@index([skuId, periodStart])
  @@index([source, periodStart])
}
```

Also add relation to Sku:
```prisma
model Sku {
  // ... existing fields
  salesData     SalesData[]
}
```

### Step 2: Create Demand Library

`src/lib/demand.ts`:
```typescript
import prisma from './db'

export interface DemandResult {
  dailyDemand: number
  source: 'sales' | 'crm_projection' | 'fallback'
  confidence: number
  needsVerification: boolean
}

export async function getDemandForSku(skuId: string): Promise<DemandResult> {
  // 1. Try real sales data (last 30 days)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const salesData = await prisma.salesData.findMany({
    where: {
      skuId,
      periodEnd: { gte: thirtyDaysAgo }
    }
  })

  if (salesData.length > 0) {
    const totalUnits = salesData.reduce((sum, s) => sum + s.unitsSold, 0)
    const totalDays = calculateTotalDays(salesData)
    return {
      dailyDemand: totalUnits / totalDays,
      source: 'sales',
      confidence: 0.95,
      needsVerification: false
    }
  }

  // 2. Try CRM velocity from LIVE opportunities
  const sku = await prisma.sku.findUnique({
    where: { id: skuId },
    include: { baseItem: true }
  })

  if (sku?.baseItemId) {
    const liveOpportunities = await prisma.opportunity.findMany({
      where: {
        baseItemId: sku.baseItemId,
        stage: 'LIVE'
      }
    })

    if (liveOpportunities.length > 0) {
      const totalWeeklyUnits = liveOpportunities.reduce(
        (sum, opp) => sum + ((opp.velocity || 0) * (opp.doors || 0)),
        0
      )
      return {
        dailyDemand: totalWeeklyUnits / 7,
        source: 'crm_projection',
        confidence: 0.6,
        needsVerification: false
      }
    }
  }

  // 3. Fallback
  return {
    dailyDemand: 10,
    source: 'fallback',
    confidence: 0.2,
    needsVerification: true
  }
}

function calculateTotalDays(salesData: { periodStart: Date; periodEnd: Date }[]): number {
  const dates = salesData.flatMap(s => [s.periodStart, s.periodEnd])
  const minDate = new Date(Math.min(...dates.map(d => d.getTime())))
  const maxDate = new Date(Math.max(...dates.map(d => d.getTime())))
  return Math.max(1, (maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24))
}
```

### Step 3: Create CSV Import Endpoint

`src/app/api/sales-data/import/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { parse } from 'csv-parse/sync'

// Expected CSV format:
// sku_number,source,period_start,period_end,units_sold,period_type
// 1010110001,KEHE,2026-03-01,2026-03-07,150,WEEKLY

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const defaultSource = formData.get('source') as string || 'csv_upload'

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const text = await file.text()
    const records = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    })

    let imported = 0
    let skipped = 0

    for (const record of records) {
      // Find SKU by number
      const sku = await prisma.sku.findFirst({
        where: { skuNumber: record.sku_number }
      })

      if (!sku) {
        skipped++
        continue
      }

      await prisma.salesData.create({
        data: {
          skuId: sku.id,
          source: record.source || defaultSource,
          periodStart: new Date(record.period_start),
          periodEnd: new Date(record.period_end),
          unitsSold: parseInt(record.units_sold, 10),
          periodType: record.period_type || 'WEEKLY',
          importSource: 'csv_upload',
        }
      })

      imported++
    }

    return NextResponse.json({ imported, skipped })
  } catch (error) {
    console.error('Import error:', error)
    return NextResponse.json({ error: 'Import failed' }, { status: 500 })
  }
}
```

### Step 4: Update Inventory Agent

In `inventory-health.ts`, replace:
```typescript
// OLD
const estimatedDailyDemand = 10
const daysOfSupply = currentQty / estimatedDailyDemand
```

With:
```typescript
// NEW
import { getDemandForSku } from '@/lib/demand'

const demandResult = await getDemandForSku(sku.id)
const daysOfSupply = currentQty / demandResult.dailyDemand

// Use in embedding context
const embeddingText = `CONTEXT: SKU=${issue.skuNumber}, Qty=${issue.currentQty}, Days=${Math.round(daysOfSupply)}, DemandSource=${demandResult.source}...`

// Flag if using fallback
if (demandResult.needsVerification) {
  // This will trigger prime directive violation
}
```

Note: The demand library imports from `@/lib/demand` not the agent-learning package since it's GT-IMS specific.

## VERIFICATION COMMANDS

```bash
# 1. Prisma schema updated
cd ~/Projects/Internal\ Systems/gt-ims && npx prisma generate

# 2. Migrations applied
cd ~/Projects/Internal\ Systems/gt-ims && npx prisma migrate dev --name add_sales_data

# 3. TypeScript compiles
cd ~/Projects/Internal\ Systems/gt-ims && npm run typecheck

# 4. Build succeeds
cd ~/Projects/Internal\ Systems/gt-ims && npm run build

# 5. Run agent
cd ~/Projects/Internal\ Systems/gt-ims && npx tsx scripts/agents/inventory-health.ts
```

## CONSTRAINTS

- DO NOT create complex EDI integration yet (that's future work)
- DO NOT require sales data to exist - fallback must work
- Keep CSV import simple - validation can be improved later
- The agent should work identically whether sales data exists or not

## ITERATION STRATEGY

1. First iteration: Add SalesData model to schema
2. Second iteration: Create getDemandForSku function
3. Third iteration: Create CSV import endpoint
4. Fourth iteration: Update inventory-health.ts to use dynamic demand
5. Fifth iteration: Verify all tests pass and agent runs correctly

## COMPLETION PROMISE

When dynamic demand is implemented:
```
<promise>DYNAMIC DEMAND IMPLEMENTED</promise>
```
