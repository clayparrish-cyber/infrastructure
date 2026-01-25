# Dynamic Demand Forecasting Design

**Date:** 2026-01-23
**Status:** RALPH READY
**Goal:** Replace hardcoded `estimatedDailyDemand = 10` with real/projected data

## Context

- GT launches Feb/March 2026
- Pre-launch: No sales data, only CRM projections
- Post-launch: Distributor sales data (EDI from main distributor, CSV from others)

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Pre-launch demand source | CRM LIVE opportunities | Only available signal before launch |
| Post-launch demand source | Distributor sales data | Real sales > projections |
| Fallback behavior | Hardcoded + warning flag | Agent still works, but flags uncertainty |

---

## Data Model

### New Table: SalesData

```prisma
model SalesData {
  id            String   @id @default(cuid())

  // What was sold
  skuId         String
  sku           Sku      @relation(fields: [skuId], references: [id])

  // Where it was sold
  source        String   // "KEHE", "UNFI", "retailer-name"
  locationCode  String?  // Distributor warehouse or retailer location

  // When and how much
  periodStart   DateTime
  periodEnd     DateTime
  unitsSold     Int

  // For calculating velocity
  periodType    String   // "WEEKLY", "MONTHLY"

  // Import tracking
  importedAt    DateTime @default(now())
  importSource  String   // "csv_upload", "edi_feed", "api"

  @@index([skuId, periodStart])
  @@index([source, periodStart])
}
```

### Existing Table: Opportunity (for CRM velocity)

Already has:
- `velocity` (units per week)
- `doors` (number of locations)
- `stage` (filter for LIVE only)
- `baseItemId` (links to SKU)

---

## Demand Calculation Logic

### Priority Order

1. **Real sales data** (post-launch, from SalesData table)
2. **CRM velocity** (from LIVE opportunities)
3. **Fallback** (hardcoded 10 units/day with warning)

### Implementation

```typescript
// lib/demand.ts

interface DemandResult {
  dailyDemand: number
  source: 'sales' | 'crm_projection' | 'fallback'
  confidence: number
  needsVerification: boolean
}

export async function getDemandForSku(
  prisma: PrismaClient,
  skuId: string
): Promise<DemandResult> {

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
      // Sum up velocity × doors across all LIVE opportunities
      const totalWeeklyUnits = liveOpportunities.reduce(
        (sum, opp) => sum + (opp.velocity * opp.doors),
        0
      )
      return {
        dailyDemand: totalWeeklyUnits / 7,
        source: 'crm_projection',
        confidence: 0.6, // Lower confidence for projections
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

function calculateTotalDays(salesData: SalesData[]): number {
  // Calculate the span of days covered by sales data
  const dates = salesData.flatMap(s => [s.periodStart, s.periodEnd])
  const minDate = new Date(Math.min(...dates.map(d => d.getTime())))
  const maxDate = new Date(Math.max(...dates.map(d => d.getTime())))
  return Math.max(1, (maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24))
}
```

---

## Integration with inventory-health.ts

### Before (Current)

```typescript
// Hardcoded - always uses 10
const estimatedDailyDemand = 10
const daysOfSupply = currentQty / estimatedDailyDemand
```

### After

```typescript
import { getDemandForSku } from '@/lib/demand'

// Dynamic - uses real data when available
const demandResult = await getDemandForSku(prisma, sku.id)
const daysOfSupply = currentQty / demandResult.dailyDemand

// Include in recommendation context
const embeddingText = `CONTEXT: SKU=${issue.skuNumber}, Qty=${issue.currentQty}, Days=${issue.daysOfSupply}, DemandSource=${demandResult.source}...`

// Flag if using fallback
if (demandResult.needsVerification) {
  // Recommendation will be flagged for human review
}
```

---

## CSV Import for Sales Data

### Import Endpoint

```typescript
// app/api/sales-data/import/route.ts

// Expected CSV format:
// sku_number, source, period_start, period_end, units_sold
// 1010110001, KEHE, 2026-03-01, 2026-03-07, 150
// 1010110001, UNFI, 2026-03-01, 2026-03-07, 85

export async function POST(request: Request) {
  const formData = await request.formData()
  const file = formData.get('file') as File
  const source = formData.get('source') as string // "KEHE", "UNFI", etc.

  // Parse CSV, validate, insert into SalesData
  // ... implementation
}
```

### UI in GT-IMS

Add to existing inventory section or new "Sales Data" page:
- File upload for CSV
- Source selector (KEHE, UNFI, etc.)
- Preview before import
- Import history

---

## Future: EDI Integration

When EDI feed is available:

1. Create scheduled job that pulls from EDI endpoint
2. Transform EDI format to SalesData records
3. Mark `importSource: 'edi_feed'`
4. Run automatically (daily/weekly)

No changes needed to demand calculation - it just uses whatever's in SalesData.

---

## Success Criteria

**Ralph Complete When:**

1. [ ] `SalesData` model added to Prisma schema
2. [ ] `getDemandForSku()` function created in `lib/demand.ts`
3. [ ] `inventory-health.ts` updated to use dynamic demand
4. [ ] CSV import endpoint created for sales data
5. [ ] Agent correctly uses CRM velocity when no sales data exists
6. [ ] Agent flags recommendations with fallback demand as `needsVerification`
7. [ ] All existing tests pass
8. [ ] TypeScript compiles without errors

---

## Timeline Alignment

| Phase | When | Demand Source |
|-------|------|---------------|
| Now → Launch | Jan-Feb 2026 | CRM projections (LIVE opportunities) |
| Launch → +30 days | Mar 2026 | Mix of early sales data + CRM projections |
| Steady state | Apr+ 2026 | Primarily sales data, CRM for new accounts |
