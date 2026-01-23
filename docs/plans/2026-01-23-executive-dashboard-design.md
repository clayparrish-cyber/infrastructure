# Executive Dashboard Design

**Date:** 2026-01-23
**Status:** Design Complete
**Goal:** Unified command center for agent recommendations across all ventures

---

## Overview

A single executive dashboard that aggregates agent recommendations from all ventures (GT-IMS, Menu Autopilot, AirTip, SidelineIQ, Dosie) into one place. Clay, Charlie, and Kamal can see pending recommendations, approve/reject them, and filter by venture.

### Why Unified?

- **One place to check** - Not 5 different dashboards
- **Cross-venture patterns** - See if agents across ventures are flagging similar issues
- **Shared infrastructure** - Auth, permissions, UI components built once
- **EOS alignment** - Supports Rocks, quarterly reviews, and OKRs tracking (future)

---

## Architecture

### Location

```
infrastructure/
├── apps/
│   └── executive-dashboard/     # Next.js app
│       ├── src/
│       │   ├── app/
│       │   ├── components/
│       │   └── lib/
│       ├── prisma/
│       │   └── schema.prisma    # Dashboard-specific schema
│       └── package.json
├── packages/
│   └── agent-learning/          # Existing shared package
├── config/
│   └── agents/
│       └── phase-1-config.ts    # Existing agent configs
└── docs/
    └── plans/
        └── 2026-01-23-executive-dashboard-design.md  # This file
```

### Data Flow: Aggregation Layer

Venture agents write to a central `executive_dashboard` database. This decouples ventures from the dashboard and allows each venture to publish recommendations independently.

```
┌─────────────────────────────────────────────────────────────────┐
│                    Venture Agent Scripts                         │
│                                                                  │
│   gt-ims/scripts/agents/      menu-autopilot/scripts/agents/    │
│   inventory-health.ts         menu-analysis.ts                   │
│   monday-briefing.ts          cost-optimizer.ts                  │
│   legal-review.ts             ...                                │
│                                                                  │
│   airtip/scripts/agents/      sidelineiq/scripts/agents/        │
│   ocr-validation.ts           curriculum-analyzer.ts             │
│   tip-audit.ts                ...                                │
│                                                                  │
│   dosie/scripts/agents/                                          │
│   reminder-optimizer.ts                                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Write recommendations via API
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Executive Dashboard API                             │
│                                                                  │
│   POST /api/recommendations                                      │
│   {                                                              │
│     venture: "gt-ims",                                           │
│     agentType: "INVENTORY",                                      │
│     priority: "HIGH",                                            │
│     recommendation: {...},                                       │
│     assignedTo: "clay@gallanttiger.com"                         │
│   }                                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              executive_dashboard Database (Neon)                 │
│                                                                  │
│   Tables:                                                        │
│   - User (Google OAuth users + permissions)                      │
│   - Venture (GT-IMS, Menu Autopilot, AirTip, etc.)              │
│   - AgentRecommendation (cross-venture recommendations)          │
│   - Decision (approval/rejection with reasoning)                 │
│   - Session (NextAuth sessions)                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Executive Dashboard UI                              │
│                                                                  │
│   /                    - Dashboard home (pending count)          │
│   /recommendations     - List view with filters                  │
│   /recommendations/[id]- Detail view with approve/reject         │
│   /settings            - User permissions (admin only)           │
└─────────────────────────────────────────────────────────────────┘
```

### Why Not Read from Venture Databases?

1. **Decoupling** - Dashboard doesn't need venture DB credentials
2. **Schema flexibility** - Ventures can evolve schemas independently
3. **Offline resilience** - Dashboard works even if venture DB is down
4. **Query performance** - Dashboard-specific indexes and queries
5. **Privacy** - Ventures control what they publish to dashboard

---

## Authentication

### Google OAuth with @gallanttiger.com

```typescript
// NextAuth configuration
providers: [
  GoogleProvider({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    authorization: {
      params: {
        hd: 'gallanttiger.com', // Restrict to GT domain
      },
    },
  }),
],
```

**Why Google OAuth:**
- No passwords to manage
- Team already uses Google Workspace
- @gallanttiger.com restriction provides security
- Can expand to @apolishospitality.com later if needed

### User Permissions

| User | Email | Ventures | Role |
|------|-------|----------|------|
| Clay | clay@gallanttiger.com | ALL (GT, MA, AT, SIQ, Dosie) | ADMIN |
| Charlie | charlie@gallanttiger.com | GT-IMS, Menu Autopilot, AirTip | USER |
| Kamal | kamal@gallanttiger.com | GT-IMS, Menu Autopilot, AirTip | USER |

**Permission model:**
- Users can only see recommendations for their assigned ventures
- ADMIN can manage user permissions
- All users can approve/reject recommendations they can see

---

## Database Schema

```prisma
// prisma/schema.prisma

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  role          Role      @default(USER)
  ventures      UserVenture[]
  decisions     Decision[]
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

model Venture {
  id              String    @id @default(cuid())
  code            String    @unique  // "gt-ims", "menu-autopilot", etc.
  name            String              // "Gallant Tiger IMS"
  users           UserVenture[]
  recommendations AgentRecommendation[]
}

model UserVenture {
  id        String   @id @default(cuid())
  userId    String
  ventureId String
  user      User     @relation(fields: [userId], references: [id])
  venture   Venture  @relation(fields: [ventureId], references: [id])

  @@unique([userId, ventureId])
}

model AgentRecommendation {
  id              String    @id @default(cuid())
  ventureId       String
  venture         Venture   @relation(fields: [ventureId], references: [id])

  // From venture agent
  agentType       String              // "INVENTORY", "LEGAL", "RESEARCH", etc.
  sourceTaskId    String?             // Original AgentTask.id from venture DB
  priority        Priority  @default(MEDIUM)
  recommendation  Json                // Structured recommendation data
  reasoning       String?             // Why this recommendation
  assignedTo      String?             // Email of intended reviewer

  // Status tracking
  status          RecommendationStatus @default(PENDING)
  decision        Decision?

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([ventureId, status])
  @@index([assignedTo, status])
}

model Decision {
  id                String    @id @default(cuid())
  recommendationId  String    @unique
  recommendation    AgentRecommendation @relation(fields: [recommendationId], references: [id])

  userId            String
  user              User      @relation(fields: [userId], references: [id])

  action            DecisionAction  // APPROVED, REJECTED, DEFERRED
  reasoning         String?         // Why this decision

  createdAt         DateTime  @default(now())
}

enum Role {
  USER
  ADMIN
}

enum Priority {
  LOW
  MEDIUM
  HIGH
  URGENT
}

enum RecommendationStatus {
  PENDING
  APPROVED
  REJECTED
  DEFERRED
}

enum DecisionAction {
  APPROVED
  REJECTED
  DEFERRED
}
```

---

## API Design

### Inbound API (Venture Agents → Dashboard)

```typescript
// POST /api/recommendations
// Called by venture agent scripts

interface CreateRecommendationRequest {
  venture: string;         // "gt-ims"
  agentType: string;       // "INVENTORY"
  sourceTaskId?: string;   // Original task ID for traceability
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  recommendation: {
    title: string;
    summary: string;
    details: Record<string, unknown>;
    suggestedAction?: string;
  };
  reasoning?: string;
  assignedTo?: string;     // Email
}

// Response: { id: string, status: "PENDING" }
```

**Authentication:** API key per venture stored in environment variables.

```bash
# Venture agent script
EXEC_DASHBOARD_API_KEY=sk_gt_ims_xxx
EXEC_DASHBOARD_URL=https://exec.gallanttiger.com
```

### Dashboard API (UI → Backend)

Standard Next.js API routes with NextAuth session validation:

```typescript
// GET /api/recommendations
// Query params: venture, status, priority, assignedTo

// GET /api/recommendations/[id]
// Returns full recommendation with decision history

// POST /api/recommendations/[id]/decide
// { action: "APPROVED" | "REJECTED" | "DEFERRED", reasoning?: string }

// GET /api/ventures
// Returns ventures user has access to

// GET /api/users (admin only)
// Returns all users with their permissions

// PUT /api/users/[id]/ventures (admin only)
// Update user venture assignments
```

---

## UI Design

### Dashboard Home (`/`)

```
┌─────────────────────────────────────────────────────────────────┐
│  Executive Dashboard                    Clay Parrish ▼          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │
│  │   Pending    │ │   Today      │ │   Urgent     │             │
│  │     12       │ │      3       │ │      1       │             │
│  └──────────────┘ └──────────────┘ └──────────────┘             │
│                                                                  │
│  Recent Recommendations                                          │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ 🔴 URGENT  GT-IMS   Inventory stockout risk for STR CRD    ││
│  │ 🟡 HIGH    MA       Menu cost variance detected             ││
│  │ 🟢 MEDIUM  AirTip   OCR accuracy improvement suggestion     ││
│  │ 🔵 LOW     GT-IMS   Weekly briefing ready                   ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  [View All Recommendations →]                                    │
└─────────────────────────────────────────────────────────────────┘
```

### Recommendations List (`/recommendations`)

```
┌─────────────────────────────────────────────────────────────────┐
│  Recommendations                        Clay Parrish ▼          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Filters:                                                        │
│  [All Ventures ▼] [All Status ▼] [All Priority ▼] [Search...]   │
│                                                                  │
│  ┌──────┬─────────┬──────────────────────────────────┬─────────┐│
│  │ Pri  │ Venture │ Title                            │ Status  ││
│  ├──────┼─────────┼──────────────────────────────────┼─────────┤│
│  │ 🔴   │ GT-IMS  │ Inventory stockout risk          │ PENDING ││
│  │ 🟡   │ MA      │ Menu cost variance detected      │ PENDING ││
│  │ 🟢   │ AirTip  │ OCR accuracy improvement         │ PENDING ││
│  │ 🔵   │ GT-IMS  │ Weekly briefing ready            │ APPROVED││
│  └──────┴─────────┴──────────────────────────────────┴─────────┘│
│                                                                  │
│  Showing 1-10 of 47                          [< Prev] [Next >]  │
└─────────────────────────────────────────────────────────────────┘
```

### Recommendation Detail (`/recommendations/[id]`)

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back to Recommendations              Clay Parrish ▼          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Inventory Stockout Risk - Strawberry Cardamom                  │
│  ─────────────────────────────────────────────────────────────  │
│  GT-IMS  •  INVENTORY Agent  •  🔴 URGENT  •  2 hours ago       │
│                                                                  │
│  Summary                                                         │
│  ───────                                                         │
│  Current inventory of STR CRD 4-pack (SKU 1010102001) is at     │
│  12 cases. Based on current velocity (8 cases/week) and lead    │
│  time (7 days), stockout projected in 10 days.                  │
│                                                                  │
│  Suggested Action                                                │
│  ────────────────                                                │
│  Create PO for 50 cases from KFF Green Bay                      │
│                                                                  │
│  Agent Reasoning                                                 │
│  ───────────────                                                 │
│  Safety stock threshold is 2 weeks. Current days-of-supply      │
│  is 10 days, which is below the 14-day safety threshold.        │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Decision                                                     ││
│  │                                                              ││
│  │ [✓ Approve] [✗ Reject] [⏸ Defer]                            ││
│  │                                                              ││
│  │ Reasoning (optional):                                        ││
│  │ ┌──────────────────────────────────────────────────────────┐││
│  │ │                                                          │││
│  │ └──────────────────────────────────────────────────────────┘││
│  │                                           [Submit Decision] ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Component | Choice | Reason |
|-----------|--------|--------|
| Framework | Next.js 16 (App Router) | Consistent with other projects |
| Styling | Tailwind CSS + shadcn/ui | Consistent with GT-IMS |
| Database | PostgreSQL on Neon | Free tier, already using for GT-IMS |
| ORM | Prisma 7 with adapter | Consistent with GT-IMS |
| Auth | NextAuth with Google | Simple SSO, domain restriction |
| Deployment | Vercel | Free tier, easy deployment |

---

## MVP Scope

### Phase 1: Core Dashboard (This Implementation)

- [ ] Next.js app setup with Tailwind + shadcn/ui
- [ ] Prisma schema and Neon database
- [ ] Google OAuth with @gallanttiger.com
- [ ] User permission model (Clay=all, Charlie/Kamal=GT/MA/AT)
- [ ] Inbound API for venture agents
- [ ] Dashboard home with pending count
- [ ] Recommendations list with filters
- [ ] Recommendation detail with approve/reject
- [ ] Settings page for user management (admin only)

### Phase 2: Enhanced Features (Future)

- [ ] EOS integration (Rocks, Quarterly Reviews)
- [ ] Notification preferences (email, Slack)
- [ ] Bulk actions (approve/reject multiple)
- [ ] Analytics (decision patterns, agent performance)
- [ ] API for venture agents to read decision outcomes

### Phase 3: Cross-Venture Intelligence (Future)

- [ ] Pattern detection across ventures
- [ ] Shared knowledge base
- [ ] Agent performance scoring

---

## Implementation Plan

### Step 1: Project Setup

```bash
cd ~/Projects/infrastructure
mkdir -p apps/executive-dashboard
cd apps/executive-dashboard

# Initialize Next.js
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir

# Add dependencies
npm install @prisma/client @prisma/adapter-pg next-auth @auth/prisma-adapter
npm install -D prisma

# Add shadcn/ui
npx shadcn@latest init
npx shadcn@latest add button card input table badge dialog
```

### Step 2: Database Setup

```bash
# Create Neon database: executive-dashboard
# Get connection string

# Initialize Prisma
npx prisma init
# Copy schema from this design doc
npx prisma migrate dev --name init
```

### Step 3: Auth Setup

```bash
# Create Google OAuth credentials in Google Cloud Console
# Restrict to @gallanttiger.com domain
# Add credentials to .env.local
```

### Step 4: Build Core Features

1. Auth flow (Google OAuth)
2. Dashboard layout + navigation
3. Recommendations API (inbound)
4. Recommendations list page
5. Recommendation detail page
6. Decision flow
7. User settings page

### Step 5: Integrate Venture Agents

Update venture agent scripts to POST to Executive Dashboard API instead of (or in addition to) writing to local AgentRecommendation tables.

---

## Environment Variables

```bash
# .env.local

# Database
DATABASE_URL="postgres://..."

# NextAuth
NEXTAUTH_SECRET="..."
NEXTAUTH_URL="https://exec.gallanttiger.com"

# Google OAuth
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."

# API Keys for venture agents
API_KEY_GT_IMS="sk_gt_..."
API_KEY_MENU_AUTOPILOT="sk_ma_..."
API_KEY_AIRTIP="sk_at_..."
API_KEY_SIDELINEIQ="sk_siq_..."
API_KEY_DOSIE="sk_dosie_..."
```

---

## Migration Path

### GT-IMS Command Center

The existing `/command-center` in GT-IMS will remain for GT-specific workflows. The Executive Dashboard is additive, not replacement.

**Coexistence strategy:**
1. GT-IMS agents can write to both places during transition
2. Eventually, GT-IMS Command Center becomes venture-specific detail view
3. Executive Dashboard becomes primary approval interface

---

## Success Criteria

**MVP Complete When:**
- [ ] Clay, Charlie, Kamal can all log in with Google
- [ ] Each user only sees their assigned ventures
- [ ] At least one venture agent successfully posts recommendation
- [ ] Recommendations can be approved/rejected
- [ ] Decisions are persisted and visible
- [ ] Deployed to Vercel at exec.gallanttiger.com (or similar)

---

**End of Design**
