# Clay Parrish - Project Briefing for Claude Chat

Copy everything below the line into a new Claude Chat conversation as the first message, or save it as a Project instruction.

---

You are talking to Clay Parrish. I'm a solo technical founder building multiple software products across several business entities with two co-founders (Charlie and Kamal). I use Claude Code (the CLI) as my primary development environment with extensive project-specific context files, automated nightly code review agents, and a disciplined skill/knowledge extraction system. This document gives you strategic context across all my active projects so you can have informed conversations without me re-explaining everything.

## How I Build

I'm a one-person engineering team building production software across 6+ projects. My approach:

- **Claude Code as co-developer.** Not generating throwaway code - building real, structured, production applications with comprehensive context files (CLAUDE.md) that maintain project memory across sessions.
- **Automated quality infrastructure.** I run nightly AI agents that perform themed code reviews (Monday=security, Tuesday=UX, Wednesday=bugs, Thursday=content, Friday=polish) across all active projects. Findings flow into a custom dashboard where I approve/reject/defer, then execute approved items in batch.
- **Disciplined architecture.** Every project has a real tech stack (Next.js 16, TypeScript, PostgreSQL, proper auth, real data models). No toy projects - even personal ones are built to production standards with security audits, proper database schemas, and deployment pipelines.
- **Knowledge extraction.** After significant work sessions, I extract reusable patterns into "skills" (structured knowledge files) that prevent re-learning the same lessons. I have 30+ custom skills covering everything from EAS build issues to marketing attribution debugging.

The result is that a single developer can maintain 6 codebases at a quality level that would normally require a small team. The agent infrastructure catches regressions and security issues overnight. The context files mean I (or Claude Code) can pick up any project cold and be productive immediately.

## Business Structure

```
Apolis Hospitality (Clay, Charlie, Kamal - co-founders)
├── Menu Autopilot - restaurant menu optimization SaaS
├── AirTip - tip management app (airtipapp.com)
└── Nashville Coop Franchise LLC (Kamal's hot chicken brand)

Gallant Tiger (same 3 founders, different investor group)
└── Premium frozen crustless PB&J sandwiches (KEHE, UNFI distribution)
    └── GT-Ops - internal operations system

Personal Projects (Clay solo)
├── SidelineIQ - "Duolingo for Sports" mobile app
├── Dosie - family medication reminder app
└── Scout - investment signal tracker
```

The entities aren't consolidated because each has different investors. Apolis does dev work for Parcelle (Kamal's organic cafe in Minneapolis) which funds some of the software development.

## Project Details

### SidelineIQ - "Duolingo for Sports"
**Status:** Live on App Store | v1.1.4 submitted for review
**Stack:** React Native + Expo SDK 54, Zustand, Expo Router
**Website:** sideline-iq.com

Gamified learning app teaching American football rules and strategy through 3-5 minute sessions. 43 lessons across 4 tiers, 7 exercise types (MCQ, true/false, scenarios, fill-in-blank, sequencing, tap-select, matching), plus teaching cards. Built with a custom design system, Amplitude analytics, local push notifications, and sound effects.

**What makes it notable:** This is a well-structured React Native codebase - clean separation of concerns (content/stores/components/hooks), proper design tokens (colors, typography, spacing, shadows), file-based routing, and a Remotion video pipeline for generating marketing ads programmatically. The curriculum content system is data-driven and extensible to new sports.

**Monetization:** Currently free. Adding AdMob + $9.99 lifetime premium in next release.

**Marketing:** Running Meta and Google Ads campaigns. Built an attribution debugging pipeline using App Store Connect Sources as ground truth (since SDK attribution lags). Created a Remotion-based video ad production system with 10 compositions and batch rendering.

---

### Dosie - Family Medication Reminders
**Status:** Live at getdosie.com | iOS SwiftUI prototype complete
**Stack:** Next.js 16 + Supabase (web), SwiftUI + Core Data (iOS prototype)
**Website:** getdosie.com

Born from my wife's frustration with existing medication reminder apps. Core insight: parents tracking kids' Tylenol/Advil don't need a chronic-daily-med tracker - they need an as-needed tracker that handles alternating schedules (Tylenol every 4h, Advil every 6h, alternating) with alarms that can't be accidentally dismissed.

**Key differentiators:**
- Household-native (track meds for kids, parents, yourself in one place)
- No dismiss button - only "Taken" or "Snooze" (the whole point)
- Alternating medication schedules (nobody else does this well)
- "Right now" default (competitor TakeYourPills asks "what time to start?" - wrong UX)
- Woman-coded design (caregivers skew female, app feels warm not clinical)

**Architecture:** Supabase with RLS policies, real-time subscriptions, share codes for household joining, caregiver assignments with notification delegation. The data model handles people, medications, doses, sick days, and quiet hours.

**B2B potential:** Home health care / hospice coordination (family + rotating aides on same patient). Not v1 scope but a real market.

---

### GT-Ops - CPG Operations System
**Status:** MVP live on Vercel | Core modules functional
**Stack:** Next.js 16, PostgreSQL (Neon), Prisma 7, shadcn/ui
**URL:** gt-ims.vercel.app

Internal operations platform for Gallant Tiger (frozen PB&J brand). Hub-and-spoke architecture where Items/SKUs are the canonical center and modules (CRM, Purchasing, Inventory, Analytics) are spokes.

**What's built:**
- Full SKU hierarchy (Department > Category > Config > BaseItem > SKU) with real product data
- CRM with prospect/client pipeline, 8-stage opportunities, driver-based revenue modeling (Doors x Velocity x Weeks x $/Case)
- PO creator with PDF generation
- Inventory snapshots with CSV import and smart column mapping
- Network map visualization (supply chain + data flows)
- Agent learning system with pgvector for similarity-based recommendation improvement
- Cookie-based auth with HMAC-signed sessions

**Integration points:** Toast POS API (orders, menus, labor), MarginEdge API (product costs, vendors, invoices), QuickBooks planned.

**Current products:** 2 flavors (Strawberry Cardamom, Blueberry Lemon Thyme) x 4 pack configs = 8 SKUs. Distributed through KEHE and UNFI.

---

### Menu Autopilot + AirTip
**Status:** Functional, connected to Parcelle restaurant
**Stack:** Next.js 16, PostgreSQL with Prisma, NextAuth, Stripe, Resend

**Menu Autopilot** analyzes restaurant menu item performance (sales, costs, margins) and generates optimization recommendations. Connected to Toast POS for sales data and MarginEdge for cost data. Built for Parcelle initially but designed as a SaaS product.

**AirTip** (at airtipapp.com, lives at `/tips` within the same codebase) handles tip management and compliance. Pulls time entries and tips from Toast POS labor API.

---

### Scout - Investment Signal Tracker
**Status:** Live on Vercel | 4 signal sources active
**Stack:** Next.js 16, Supabase, Claude API, Discord webhooks

Monitors multiple data sources for investment signals and sends Discord alerts:
- **Kalshi** prediction markets (extreme prices, high volume detection)
- **SEC Form 4** insider purchases ($100K+ S&P 500 buys)
- **Congressional trades** via FMP API (Senate/House, notable members like Pelosi)
- **Crypto** top 15 coins via CoinGecko (momentum, dips, breakouts, volume spikes)

Semi-automated paper trading through Alpaca API (Scout suggests, I approve). On-demand Claude "team of rivals" analysis per signal. Runs on Vercel Hobby tier with heuristic-based scanning (Claude API calls moved to on-demand due to 10s timeout constraint).

---

## Infrastructure & Quality

### Nightly Agent System
Registry-driven, multi-project automated code review infrastructure:
- **5 themed reviews** per project (security, UX, bugs, content, polish)
- **Core profile** (weekly full rotation): SidelineIQ, AirTip, Dosie
- **Scaffolded profile** (Saturday rotation): GT-Ops, Menu Autopilot
- **Sunday ops agent** handles folder hygiene, doc sync, task deduplication
- **Custom dashboard** (Next.js) for reviewing findings, approving/rejecting, generating task lists
- **30+ custom skills** for common patterns (build issues, API quirks, marketing attribution, etc.)

**Operational update (2026-02-08): CI paused, local is primary.**
As of Feb 8, 2026, the GitHub Actions/CI-based nightly automation is intentionally paused. The system is now run locally and manually triggered in the morning from the dashboard or terminal when the laptop is awake and the workspace is mounted. This change was made to reduce fragility, cost, and hidden failures while the concepts are still pre-revenue. Please do not assume overnight CI runs are happening, and align any internal docs or guidance to reflect local/manual execution as the source of truth until this is explicitly re-enabled.

### Tech Stack Consistency
Every project uses the same core: Next.js 16 + App Router, TypeScript, Tailwind CSS, PostgreSQL (Neon or Supabase), deployed on Vercel. This isn't accidental - consistency means I can context-switch between projects instantly and reuse patterns everywhere.

## Key People

| Person | Role | Context |
|--------|------|---------|
| **Clay** | CGO / solo dev | Backend, tools, agents - builds everything |
| **Charlie** | COO | Sales, CRM, operations (uses GT-Ops daily) |
| **Kamal** | CEO | Brand, flavor, restaurant ops. Owns Parcelle, Nashville Coop, Kizzo, Wildchld |
| **Cass** | Clay's wife | Dosie's original user/tester. Her pain points drive the product. |

## How to Talk to Me

- I prefer direct, technical conversations. Skip preamble and validation.
- I'll reference projects by name (e.g., "the Dosie RLS migration" or "GT-Ops CRM pipeline").
- If I ask about architecture or approach, I want tradeoffs and opinions, not just options.
- I care about sustainable solo-dev practices - how to maintain quality across multiple codebases without burning out.
- I value simplicity. If you suggest adding something, I'll ask why. The right answer is usually "don't add it yet."
