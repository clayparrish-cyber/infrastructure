# Executive Dashboard Design

**Date:** 2026-01-23
**Status:** RALPH READY
**Goal:** Unified command center for agent recommendations across all ventures

## Design Decisions (2026-01-23)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Location | `infrastructure/apps/executive-dashboard/` | Keeps hub centralized with agent configs |
| Database | Shared GT-IMS Neon instance | Simple, no API needed, agent data already there |
| Auth | Google OAuth @gallanttiger.com only | Can expand domains later if needed |
| MVP Scope | Full L10 meeting interface | Replaces Leadership Team Meeting Google Doc |

---

## Overview

A single executive dashboard that:
1. Aggregates agent recommendations from all ventures (GT-IMS, Menu Autopilot, AirTip, SidelineIQ, Dosie)
2. **Replaces the Leadership Team Meeting Google Doc** with a native L10 meeting interface

Clay, Charlie, and Kamal can see pending recommendations, approve/reject them, run their weekly L10 meetings, and track Rocks and Scorecard metrics - all in one place.

### Why Unified?

- **One place to check** - Not 5 different dashboards or Google Docs
- **Cross-venture patterns** - See if agents across ventures are flagging similar issues
- **Shared infrastructure** - Auth, permissions, UI components built once
- **EOS native** - L10 meetings, Scorecard, Rocks, IDS built into the workflow
- **Agent → Meeting flow** - Agent recommendations automatically surface in IDS discussions

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

### Data Flow: Shared Database (Simplified)

**Decision:** Executive Dashboard connects directly to GT-IMS Neon database. No separate API needed.

```
┌─────────────────────────────────────────────────────────────────┐
│                    GT-IMS Neon PostgreSQL                        │
│                                                                  │
│   Existing Tables (from GT-IMS):                                 │
│   - AgentTask, AgentRecommendation, AgentAlert                   │
│   - User (cookie auth - will add Google OAuth)                   │
│   - All GT-IMS business tables                                   │
│                                                                  │
│   New Tables (for L10 meetings):                                 │
│   - Meeting, CheckIn, Headline, IdsItem                          │
│   - Rock, ScorecardMetric, ScorecardEntry                        │
│   - Todo                                                         │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────────────┐
│   GT-IMS                │     │   Executive Dashboard            │
│   gt-ims.vercel.app     │     │   exec.gallanttiger.com          │
│                         │     │                                  │
│   Venture-specific UI:  │     │   Cross-venture UI:              │
│   - Item Master         │     │   - L10 Meeting view             │
│   - PO Creator          │     │   - Scorecard                    │
│   - CRM Pipeline        │     │   - Rocks                        │
│   - Command Center      │     │   - IDS (with agent recs)        │
│   - Inventory           │     │   - Agent recommendation list    │
└─────────────────────────┘     └─────────────────────────────────┘
              │                               │
              └───────────────┬───────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Agent Scripts                                 │
│                                                                  │
│   gt-ims/scripts/agents/                                         │
│   - inventory-health.ts (writes AgentRecommendation directly)    │
│   - monday-briefing.ts                                           │
│                                                                  │
│   Future ventures write to same DB with ventureTag field         │
└─────────────────────────────────────────────────────────────────┘
```

### Why Shared Database?

1. **Simplest possible approach** - No API layer to build/maintain
2. **Agent data already in GT-IMS** - No need to duplicate
3. **Single Prisma schema** - L10 tables added to GT-IMS schema
4. **Easy to expand** - Add `ventureTag` field when other ventures add agents
5. **GT is primary venture** - Makes sense to centralize there for now

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

| User | Email | Ventures | Role | Notes |
|------|-------|----------|------|-------|
| Clay | [ADMIN_EMAIL] | ALL (GT, MA, AT, SIQ, Dosie) | ADMIN | Runs SIQ + Dosie solo |
| Charlie | [USER_EMAIL_1] | GT-IMS, Menu Autopilot, AirTip | USER | Shared ventures only |
| Kamal | [USER_EMAIL_2] | GT-IMS, Menu Autopilot, AirTip | USER | Shared ventures only |

**Venture Ownership:**
- **Shared (Clay + Charlie + Kamal):** Gallant Tiger, Menu Autopilot, AirTip (via Apolis Hospitality + Parcelle)
- **Clay solo:** SidelineIQ, Dosie

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

### Phase 1: Core Dashboard + L10 Meetings (This Implementation)

**Core Dashboard:**
- [ ] Next.js app setup with Tailwind + shadcn/ui
- [ ] Prisma schema and Neon database
- [ ] Google OAuth with @gallanttiger.com
- [ ] User permission model (Clay=all, Charlie/Kamal=GT/MA/AT)
- [ ] Inbound API for venture agents
- [ ] Dashboard home with pending count
- [ ] Recommendations list with filters
- [ ] Recommendation detail with approve/reject
- [ ] Settings page for user management (admin only)

**L10 Meeting Integration:**
- [ ] Meeting schema (Meeting, CheckIn, Headline, IdsItem, Todo, Rock, ScorecardMetric)
- [ ] L10 meeting view with timed sections
- [ ] Scorecard view with manual metric entry
- [ ] Rocks view with progress tracking
- [ ] IDS view integrating agent recommendations + manual issues
- [ ] To-do creation and tracking
- [ ] Meeting history/archive

### Phase 2: Automation + Intelligence (Future)

- [ ] Auto-populate scorecard metrics from venture databases
- [ ] Notification preferences (email, Slack)
- [ ] Bulk actions (approve/reject multiple)
- [ ] Google Docs export after each meeting
- [ ] Analytics (decision patterns, agent performance)
- [ ] API for venture agents to read decision outcomes

### Phase 3: Cross-Venture Intelligence (Future)

- [ ] Pattern detection across ventures
- [ ] Shared knowledge base
- [ ] Agent performance scoring
- [ ] Predictive recommendations based on historical decisions

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

## EOS L10 Meeting Integration

### Replacing the Leadership Google Doc

The Executive Dashboard will replace the existing Google Doc-based "Leadership Team Meeting Agenda" document. Instead of maintaining a separate doc, meeting elements become native to the dashboard.

**Current State (Google Doc):**
- Manual weekly entries dated with bullet points
- Links to external Scorecard and Rocks sheets
- To-do items scattered throughout
- Issues sections without tracking
- No connection to agent recommendations

**Future State (Executive Dashboard):**
- Structured L10 meeting view with timed sections
- Scorecard metrics pulled from venture databases
- Rocks tracked with progress indicators
- Issues become IDS items that can spawn agent recommendations
- Agent recommendations feed into IDS discussion

### EOS L10 Meeting Structure

The standard EOS Level 10 meeting runs 90 minutes with this structure:

| Section | Duration | Dashboard Integration |
|---------|----------|----------------------|
| **Check-In** | 5 min | Quick status from each person (text input) |
| **Scorecard Review** | 10 min | Auto-populated metrics from ventures |
| **Rock Review** | 5 min | Quarterly priorities with on/off track status |
| **Headlines** | 5 min | Quick updates from each person |
| **IDS** | 60 min | Identify, Discuss, Solve - includes agent recommendations |
| **Close** | 5 min | Recap to-dos, rate meeting 1-10 |

### Agent Types: Analysts vs Researchers

| Agent Type | Data Source | Example |
|------------|-------------|---------|
| **Analysts** | Internal venture data | Inventory health, menu cost variance, tip accuracy |
| **Researchers** | External sources | UNFI trends, competitor analysis, industry reports |

Analysts fit the "watch internal data → surface issues" flow. Researchers are more on-demand or periodic—they pull from external sources and may not trigger from internal events.

### Data Flow: Meetings + Recommendations

```
┌─────────────────────────────────────────────────────────────────┐
│                    Meeting Day Flow                              │
│                                                                  │
│  1. Agents auto-populate:                                        │
│     - Scorecard metrics (from venture DBs via Analyst agents)    │
│     - Rock progress updates                                      │
│     - New issues/recommendations for IDS                         │
│                                                                  │
│  2. During meeting:                                              │
│     - Review scorecard (10 min)                                  │
│     - Review rocks on/off track (5 min)                          │
│     - Headlines from Clay, Charlie, Kamal (5 min)                │
│     - IDS: Agent recommendations + manual issues (60 min)        │
│                                                                  │
│  3. After meeting:                                               │
│     - To-dos assigned with owners                                │
│     - Decisions recorded on recommendations                      │
│     - Meeting notes saved                                        │
└─────────────────────────────────────────────────────────────────┘
```

### Additional Database Schema

```prisma
// Add to existing schema

model Meeting {
  id            String    @id @default(cuid())
  date          DateTime
  attendees     String[]  // Emails of attendees

  // Check-in responses
  checkIns      CheckIn[]

  // Headlines
  headlines     Headline[]

  // IDS items (includes agent recommendations)
  idsItems      IdsItem[]

  // To-dos created during meeting
  todos         Todo[]

  // Meeting rating (1-10)
  rating        Int?
  notes         String?

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

model CheckIn {
  id          String   @id @default(cuid())
  meetingId   String
  meeting     Meeting  @relation(fields: [meetingId], references: [id])
  userId      String
  content     String   // "Good week, closed Bay State deal"
  createdAt   DateTime @default(now())
}

model Headline {
  id          String   @id @default(cuid())
  meetingId   String
  meeting     Meeting  @relation(fields: [meetingId], references: [id])
  userId      String
  content     String   // Quick update
  createdAt   DateTime @default(now())
}

model IdsItem {
  id                String   @id @default(cuid())
  meetingId         String
  meeting           Meeting  @relation(fields: [meetingId], references: [id])

  // Can be linked to agent recommendation OR manual
  recommendationId  String?  @unique
  recommendation    AgentRecommendation? @relation(fields: [recommendationId], references: [id])

  // For manual IDS items
  title             String
  description       String?
  raisedBy          String   // Email

  // IDS outcome
  status            IdsStatus @default(IDENTIFIED)
  solution          String?

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}

model Todo {
  id          String    @id @default(cuid())
  meetingId   String?
  meeting     Meeting?  @relation(fields: [meetingId], references: [id])

  title       String
  owner       String    // Email
  dueDate     DateTime?
  status      TodoStatus @default(OPEN)

  // Link to IDS item that spawned this
  idsItemId   String?

  createdAt   DateTime  @default(now())
  completedAt DateTime?
}

model Rock {
  id          String    @id @default(cuid())
  quarter     String    // "Q1 2026"
  title       String
  owner       String    // Email
  ventureId   String?   // Optional - some rocks are cross-venture
  status      RockStatus @default(ON_TRACK)
  progress    Int       @default(0) // 0-100
  notes       String?

  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}

model ScorecardMetric {
  id          String    @id @default(cuid())
  ventureId   String
  venture     Venture   @relation(fields: [ventureId], references: [id])

  name        String    // "Revenue", "Customer Count", etc.
  target      Float
  actual      Float?
  unit        String    // "$", "%", "#"
  frequency   String    // "weekly", "monthly"

  // Who owns this metric
  owner       String    // Email

  // Auto-update from venture DB
  sourceQuery String?   // Optional: SQL or API call to get actual value

  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}

enum IdsStatus {
  IDENTIFIED
  DISCUSSING
  SOLVED
  DROPPED
}

enum TodoStatus {
  OPEN
  COMPLETED
  DROPPED
}

enum RockStatus {
  ON_TRACK
  OFF_TRACK
  COMPLETED
  DROPPED
}
```

### UI: Meeting View (`/meetings`)

```
┌─────────────────────────────────────────────────────────────────┐
│  L10 Meeting                               Clay Parrish ▼       │
│  January 23, 2026                                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────┐ ┌───────────┐ ┌──────┐ ┌─────────┐ ┌─────┐ ┌─────┐│
│  │ Check-In│ │ Scorecard │ │ Rocks│ │Headlines│ │ IDS │ │Close││
│  │  5 min  │ │  10 min   │ │5 min │ │  5 min  │ │60min│ │5 min││
│  │   ✓     │ │     ●     │ │      │ │         │ │     │ │     ││
│  └─────────┘ └───────────┘ └──────┘ └─────────┘ └─────┘ └─────┘│
│                                                                  │
│  ═══════════════════════════════════════════════════════════════│
│                                                                  │
│  SCORECARD                                          [Edit →]    │
│  ┌──────────────────┬────────┬────────┬────────┬────────┐      │
│  │ Metric           │ Owner  │ Target │ Actual │ Status │      │
│  ├──────────────────┼────────┼────────┼────────┼────────┤      │
│  │ GT Revenue       │ Charlie│ $50K   │ $48K   │   🟡   │      │
│  │ GT Inventory Days│ Clay   │ 14     │ 12     │   🟢   │      │
│  │ MA MRR           │ Clay   │ $5K    │ $4.2K  │   🟡   │      │
│  │ AirTip Accuracy  │ Clay   │ 98%    │ 97.5%  │   🟢   │      │
│  └──────────────────┴────────┴────────┴────────┴────────┘      │
│                                                                  │
│  [Next: Rock Review →]                                          │
└─────────────────────────────────────────────────────────────────┘
```

### UI: IDS View (During Meeting)

```
┌─────────────────────────────────────────────────────────────────┐
│  IDS - Identify, Discuss, Solve                   60 min left   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Issues to Discuss (7)                    [+ Add Manual Issue]  │
│                                                                  │
│  ┌─ Agent Recommendations (3) ────────────────────────────────┐ │
│  │                                                             │ │
│  │ 🔴 URGENT  GT-IMS   Inventory stockout risk - STR CRD      │ │
│  │ 🟡 HIGH    MA       Menu cost variance detected            │ │
│  │ 🟢 MEDIUM  GT-IMS   Legal review: "best frozen sandwich"   │ │
│  │                                                             │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─ Manual Issues (4) ────────────────────────────────────────┐ │
│  │                                                             │ │
│  │ ● Nashville Coop franchise timeline      (Kamal)           │ │
│  │ ● KFF production capacity for Q2         (Charlie)         │ │
│  │ ● HACCP certification next steps         (Clay)            │ │
│  │ ● Interstellar partnership decision      (Kamal)           │ │
│  │                                                             │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  Currently Discussing:                                          │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ 🔴 Inventory stockout risk - STR CRD                        ││
│  │ Agent recommendation: Create PO for 50 cases from KFF      ││
│  │                                                              ││
│  │ Discussion notes:                                            ││
│  │ ┌──────────────────────────────────────────────────────────┐││
│  │ │ Charlie: KFF has capacity, should order 75 cases for     │││
│  │ │ buffer heading into Q2...                                │││
│  │ └──────────────────────────────────────────────────────────┘││
│  │                                                              ││
│  │ [Solve: Create To-Do] [Drop] [Move to Next Week]            ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### UI: Rocks View (`/rocks`)

```
┌─────────────────────────────────────────────────────────────────┐
│  Q1 2026 Rocks                             Clay Parrish ▼       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Company Rocks                                    [+ Add Rock]  │
│                                                                  │
│  ┌──────────────────────────────────┬────────┬────────┬───────┐│
│  │ Rock                             │ Owner  │Progress│ Status││
│  ├──────────────────────────────────┼────────┼────────┼───────┤│
│  │ Launch GT-IMS network map        │ Clay   │ 100%   │   ✓   ││
│  │ Close 3 new retail accounts      │ Charlie│  66%   │   🟢  ││
│  │ HACCP certification              │ Clay   │  20%   │   🟡  ││
│  │ Nashville Coop franchise docs    │ Kamal  │  40%   │   🟢  ││
│  │ Menu Autopilot beta launch       │ Clay   │  80%   │   🟢  ││
│  └──────────────────────────────────┴────────┴────────┴───────┘│
│                                                                  │
│  Legend: ✓ Complete  🟢 On Track  🟡 Off Track                  │
└─────────────────────────────────────────────────────────────────┘
```

### Google Docs Sync Strategy

For historical data and external sharing, we can optionally sync with Google Docs:

**Option A: Dashboard as Source of Truth (Recommended)**
- All meeting data lives in the dashboard database
- Google Doc becomes read-only archive, auto-generated after each meeting
- Export meeting summary to Google Doc for external stakeholders

**Option B: Bidirectional Sync**
- Parse Google Doc structure into database
- Allow edits in either place
- More complex, higher maintenance

**Recommendation:** Start with Option A. The dashboard is the source of truth, and we generate a Google Doc summary after each meeting for anyone who needs it.

```typescript
// POST /api/meetings/[id]/export-to-docs
// Creates or updates a Google Doc with meeting summary

interface MeetingExport {
  title: string;        // "Leadership Team Meeting - Jan 23, 2026"
  checkIns: string[];   // Check-in responses
  scorecardSummary: string;
  rocksSummary: string;
  headlines: string[];
  idsDiscussed: IdsExport[];
  todosCreated: TodoExport[];
  rating: number;
}
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

**Authentication & Permissions:**
- [ ] Clay, Charlie, Kamal can all log in with Google
- [ ] Each user only sees their assigned ventures

**Agent Recommendations:**
- [ ] At least one venture agent successfully posts recommendation
- [ ] Recommendations can be approved/rejected
- [ ] Decisions are persisted and visible

**L10 Meetings (Replaces Google Doc):**
- [ ] Can create a new meeting with date
- [ ] Scorecard metrics can be entered and tracked week-over-week
- [ ] Rocks can be created with owner and progress
- [ ] IDS view shows agent recommendations + manual issues
- [ ] To-dos can be created from IDS discussion
- [ ] Meeting history is preserved and browsable
- [ ] Team agrees dashboard replaces the Leadership Team Meeting Google Doc

**Deployment:**
- [ ] Deployed to Vercel at exec.gallanttiger.com (or similar)

---

**End of Design**
