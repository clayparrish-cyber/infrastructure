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

**Next Steps:**
- [ ] Create legal-review.ts, research-request.ts, db-optimization.ts agent scripts
- [ ] Run full Phase 1 test suite
- [ ] Implement Executive Dashboard MVP

## Development

```bash
cd ~/Projects/infrastructure

# Agent configs
cat config/agents/phase-1-config.ts

# View design docs
ls docs/plans/
```

## Related Projects

| Project | Path | Relationship |
|---------|------|--------------|
| GT-IMS | ~/Projects/Internal Systems/gt-ims | Primary test bed, has working agents |
| Menu Autopilot | ~/Projects/menu-autopilot | Future agent integration |
| AirTip | ~/Projects/menu-autopilot (at /tips) | Future agent integration |
| SidelineIQ | ~/Projects/SidelineIQ/sideline-iq | Future agent integration |
| Dosie | ~/Projects/Dosie/web | Future agent integration |
