# RALPH MISSION: Build Executive Dashboard

## PRIME DIRECTIVE

Create the Executive Dashboard - a unified L10 meeting interface that replaces the Leadership Team Meeting Google Doc and surfaces agent recommendations for approval.

## SUCCESS CRITERIA

Output `<promise>EXECUTIVE DASHBOARD DEPLOYED</promise>` when ALL conditions are met:

1. Next.js app created at `infrastructure/apps/executive-dashboard/`
2. Google OAuth working with @gallanttiger.com domain restriction
3. L10 meeting schema added to GT-IMS Prisma (Meeting, CheckIn, Headline, IdsItem, Rock, ScorecardMetric, Todo)
4. L10 meeting interface working (all 6 sections: Check-In, Scorecard, Rocks, Headlines, IDS, Close)
5. Agent recommendations visible in IDS section with approve/reject
6. Deployed to Vercel
7. All TypeScript compiles without errors

## DESIGN DOC

Read the full design: `docs/plans/2026-01-23-executive-dashboard-design.md`

## KEY DECISIONS

| Decision | Choice |
|----------|--------|
| Location | `infrastructure/apps/executive-dashboard/` |
| Database | Shared GT-IMS Neon instance (same connection string) |
| Auth | Google OAuth @gallanttiger.com only |
| MVP Scope | Full L10 meeting interface |

## ARCHITECTURE

```
infrastructure/apps/executive-dashboard/
├── src/
│   ├── app/
│   │   ├── page.tsx                 # Dashboard home
│   │   ├── meetings/
│   │   │   ├── page.tsx             # Meeting list
│   │   │   └── [id]/page.tsx        # L10 meeting view
│   │   ├── rocks/page.tsx           # Rocks view
│   │   ├── scorecard/page.tsx       # Scorecard view
│   │   └── api/
│   │       └── auth/[...nextauth]/  # Google OAuth
│   ├── components/
│   │   ├── meeting/                 # L10 section components
│   │   ├── ids/                     # IDS + agent recommendation components
│   │   └── ui/                      # shadcn components
│   └── lib/
│       ├── auth.ts                  # NextAuth config
│       └── db.ts                    # Prisma client (uses GT-IMS DB)
├── package.json
└── next.config.ts
```

## DATABASE SCHEMA

Add these tables to GT-IMS Prisma schema (`~/Projects/Internal Systems/gt-ims/prisma/schema.prisma`):

```prisma
model Meeting {
  id        String     @id @default(cuid())
  date      DateTime
  status    MeetingStatus @default(SCHEDULED)
  rating    Int?
  notes     String?
  checkIns  CheckIn[]
  headlines Headline[]
  idsItems  IdsItem[]
  todos     Todo[]
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
}

model CheckIn {
  id        String   @id @default(cuid())
  meetingId String
  meeting   Meeting  @relation(fields: [meetingId], references: [id])
  userId    String
  content   String
  createdAt DateTime @default(now())
}

model Headline {
  id        String   @id @default(cuid())
  meetingId String
  meeting   Meeting  @relation(fields: [meetingId], references: [id])
  userId    String
  content   String
  createdAt DateTime @default(now())
}

model IdsItem {
  id               String    @id @default(cuid())
  meetingId        String?
  meeting          Meeting?  @relation(fields: [meetingId], references: [id])
  recommendationId String?   @unique
  recommendation   AgentRecommendation? @relation(fields: [recommendationId], references: [id])
  title            String
  description      String?
  raisedBy         String
  status           IdsStatus @default(IDENTIFIED)
  solution         String?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
}

model Todo {
  id          String     @id @default(cuid())
  meetingId   String?
  meeting     Meeting?   @relation(fields: [meetingId], references: [id])
  title       String
  owner       String
  dueDate     DateTime?
  status      TodoStatus @default(OPEN)
  createdAt   DateTime   @default(now())
  completedAt DateTime?
}

model Rock {
  id         String     @id @default(cuid())
  quarter    String
  title      String
  owner      String
  ventureTag String?
  status     RockStatus @default(ON_TRACK)
  progress   Int        @default(0)
  notes      String?
  createdAt  DateTime   @default(now())
  updatedAt  DateTime   @updatedAt
}

model ScorecardMetric {
  id        String   @id @default(cuid())
  name      String
  target    Float
  unit      String
  owner     String
  ventureTag String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  entries   ScorecardEntry[]
}

model ScorecardEntry {
  id         String          @id @default(cuid())
  metricId   String
  metric     ScorecardMetric @relation(fields: [metricId], references: [id])
  weekOf     DateTime
  value      Float?
  status     ScorecardStatus @default(NA)
  notes      String?
  createdAt  DateTime        @default(now())
}

enum MeetingStatus {
  SCHEDULED
  IN_PROGRESS
  COMPLETED
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

enum ScorecardStatus {
  ON_TRACK
  OFF_TRACK
  NA
}
```

Also add relation to AgentRecommendation:
```prisma
model AgentRecommendation {
  // ... existing fields
  idsItem  IdsItem?
}
```

## SETUP COMMANDS

```bash
# 1. Create app directory
cd ~/Projects/infrastructure
mkdir -p apps/executive-dashboard
cd apps/executive-dashboard

# 2. Initialize Next.js
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --no-git

# 3. Add dependencies
npm install next-auth @auth/prisma-adapter @prisma/client
npm install -D prisma

# 4. Add shadcn/ui
npx shadcn@latest init
npx shadcn@latest add button card input table badge dialog tabs

# 5. Copy Prisma config from GT-IMS (uses same DB)
# Create prisma/schema.prisma pointing to GT-IMS Neon
```

## GOOGLE OAUTH SETUP

1. Go to Google Cloud Console
2. Create OAuth 2.0 credentials
3. Add authorized redirect: `https://exec.gallanttiger.com/api/auth/callback/google`
4. Restrict to @gallanttiger.com domain in NextAuth config

## VERCEL DEPLOYMENT

1. Connect infrastructure repo to Vercel
2. Set root directory to `apps/executive-dashboard`
3. Add environment variables (DATABASE_URL, NEXTAUTH_SECRET, GOOGLE_*)
4. Deploy

## CONSTRAINTS

- DO NOT create a separate database - use GT-IMS Neon instance
- DO NOT build an API for agents - they already write to shared DB
- Use GT brand colors (purple primary, cream background)
- Keep the L10 structure flexible (not strict timers)

## VERIFICATION COMMANDS

```bash
# TypeScript compiles
cd ~/Projects/infrastructure/apps/executive-dashboard && npm run build

# GT-IMS schema updated
cd ~/Projects/Internal\ Systems/gt-ims && npx prisma generate

# Prisma migrations applied
cd ~/Projects/Internal\ Systems/gt-ims && npx prisma migrate dev
```

## ITERATION STRATEGY

1. First iteration: Project setup, Prisma schema
2. Second iteration: Google OAuth with domain restriction
3. Third iteration: Dashboard home + meeting list
4. Fourth iteration: L10 meeting view with all 6 sections
5. Fifth iteration: IDS integration with agent recommendations
6. Sixth iteration: Rocks and Scorecard views
7. Seventh iteration: Deploy to Vercel

## COMPLETION PROMISE

When the Executive Dashboard is deployed and working:
```
<promise>EXECUTIVE DASHBOARD DEPLOYED</promise>
```
