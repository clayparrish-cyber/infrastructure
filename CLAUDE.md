# Infrastructure Project Context

## What This Is

Central hub for shared infrastructure across Clay's ventures. Contains:
- Agent configurations and marketplace integrations
- Shared packages (@clayparrish/agent-learning)
- Executive Dashboard (unified command center)
- Cross-venture tooling

## Architecture: Hub and Spoke

```
infrastructure/                    # THE HUB
├── apps/
│   └── executive-dashboard/       # Unified dashboard (in design)
├── packages/
│   └── agent-learning/            # Shared npm package
├── config/
│   └── agents/
│       └── phase-1-config.ts      # Agent configurations
├── .claude/
│   └── agents/                    # 15 marketplace agent prompts
└── docs/
    ├── agent-marketplace-evaluation.md
    ├── phase-1-implementation-guide.md
    └── plans/
        └── 2026-01-23-executive-dashboard-design.md

gt-ims/                            # SPOKE (venture)
├── scripts/agents/                # Venture-specific agent scripts
│   ├── inventory-health.ts        # ✅ Working
│   └── monday-briefing.ts         # ✅ Working
└── app/command-center/            # Venture-specific approval UI

menu-autopilot/                    # SPOKE (venture)
airtip/                            # SPOKE (venture)
sidelineiq/                        # SPOKE (venture)
dosie/                             # SPOKE (venture)
```

## Key Concepts

### Agent Flow
1. Venture agent scripts run (cron or manual)
2. Create AgentTask record (in venture DB)
3. Analyze data, generate recommendations
4. POST recommendation to Executive Dashboard API
5. Recommendation appears in unified dashboard
6. Human approves/rejects in L10 meeting IDS discussion

### Phase 1 Agents (Installed 2026-01-23)
15 agents from aitmpl.com marketplace:
- Business Analyst
- Legal Advisor
- Marketing Attribution Analyst
- Deep Research Team (11 agents)
- PostgreSQL DBA

### Executive Dashboard (In Design)
Replaces Leadership Team Meeting Google Doc with:
- L10 meeting interface (Check-In, Scorecard, Rock Review, Headlines, IDS, Close)
- Cross-venture agent recommendations
- Rocks and Scorecard tracking
- Google OAuth with @gallanttiger.com

Design doc: `docs/plans/2026-01-23-executive-dashboard-design.md`

## Current Status (2026-01-23)

**Completed:**
- [x] 15 Phase 1 agents installed
- [x] inventory-health.ts and monday-briefing.ts verified working
- [x] GT-IMS Command Center deployed (gt-ims.vercel.app/command-center)
- [x] Executive Dashboard design document written
- [x] **Agent Learning Loop Closed** (Ralph mission completed):
  - Signal scores calculated on human decisions (60% decision, 20% recency, 20% priority)
  - Similarity query finds past recommendations before generating new ones
  - Few-shot examples formatted and included in recommendation reasoning
  - 7-day deduplication prevents duplicate recommendations
  - All 32 unit tests pass

**Next Steps:**
- [ ] Build Executive Dashboard MVP (Priority 2)
- [x] **Add prime directives to agents** (Priority 3) - ✅ COMPLETED 2026-01-23
- [ ] Fix hardcoded demand value in inventory-health.ts (Priority 4)
- [ ] Create legal-review.ts, research-request.ts, db-optimization.ts agent scripts

### @clayparrish/agent-learning Package

Shared npm package for agent learning capabilities:

```
packages/agent-learning/
├── src/
│   ├── scoring/signal-score.ts      # calculateSignalScore()
│   ├── learning/
│   │   ├── similarity.ts            # findSimilarRecommendations()
│   │   └── few-shot.ts              # formatExamplesForPrompt()
│   ├── embeddings/generate.ts       # generateEmbedding()
│   ├── directives/
│   │   ├── types.ts                 # Directive, DirectiveContext, Violation
│   │   └── check.ts                 # checkDirectives(), formatViolations()
│   └── db/connection.ts             # Database connection helpers
└── dist/                            # Compiled output (use this for imports)
```

### Agent Prime Directives (Added 2026-01-23)

Guardrails that prevent agent drift by flagging violations for human review:

**Config:** `config/agents/prime-directives.ts`

**Universal Directives (all agents):**
- `cite-source` - Must cite data source for every recommendation
- `flag-uncertainty` - Flag when confidence < 80%
- `human-reasoning` - Include human-readable reasoning (>20 chars)

**Agent-Specific Directives:**
- INVENTORY: `fresh-data` (data < 7 days), `realistic-demand` (CRM-based)
- LEGAL: `no-advice` (flag only, never provide legal advice)
- RESEARCH: `cite-sources` (must include URLs)

**Enforcement:** Soft - violations set `needsVerification=true` and populate `violationReason` for Command Center review.

**Usage in venture projects:**
```json
// package.json
"dependencies": {
  "@clayparrish/agent-learning": "file:../../infrastructure/packages/agent-learning"
}
```

**Note:** Next.js 16 requires webpack config for `file:` linked packages. See skill: `nextjs-exclude-scripts-from-build`

## Development

```bash
cd /Volumes/Lexar/Projects/infrastructure

# Agent configs
cat config/agents/phase-1-config.ts

# View design docs
ls docs/plans/
```

## Related Projects

| Project | Path | Relationship |
|---------|------|--------------|
| GT-Ops | /Volumes/Lexar/Projects/Gallant Tiger/gt-ops | Primary test bed, has working agents |
| Menu Autopilot | /Volumes/Lexar/Projects/Apolis/menu-autopilot | Future agent integration |
| AirTip | /Volumes/Lexar/Projects/Apolis/menu-autopilot (at /tips) | Future agent integration |
| SidelineIQ | /Volumes/Lexar/Projects/Personal/SidelineIQ/sideline-iq | Future agent integration |
| Dosie | /Volumes/Lexar/Projects/Personal/Dosie/web | Future agent integration |
