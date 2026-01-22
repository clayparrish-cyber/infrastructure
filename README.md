# Projects Infrastructure

Central hub for cross-project infrastructure, shared packages, tools, and documentation.

## Structure

```
infrastructure/
├── docs/                     # Cross-project design documents
│   └── plans/               # Dated design docs for shared systems
├── packages/                # Shared npm packages (@clayparrish/*)
│   └── agent-learning/      # Agent learning systems (metrics, few-shot, experiments, knowledge)
├── tools/                   # Shared tools and utilities
│   └── agent-dashboard/     # Dashboard for monitoring agents across all projects
├── AGENT_PLANS.md          # Master agent planning document
└── README.md               # This file
```

## Packages

### @clayparrish/agent-learning

**Version:** 0.1.0-phase1 (released 2026-01-22)

Shared agent infrastructure enabling learning from past decisions:
- ✅ **Few-shot learning** - Learn from high-quality past recommendations using pgvector similarity search
- ✅ **Signal scoring** - Quality metrics (60% decision, 20% recency, 20% priority)
- ✅ **Embedding generation** - OpenAI text-embedding-3-small integration with graceful degradation
- ⏳ **Metrics tracking** - Performance measurement (Phase 2)
- ⏳ **Experiment framework** - A/B testing with statistical validation (Phase 2)
- ⏳ **AgentKnowledge layer** - Cross-agent intelligence sharing (Phase 3)

**Currently integrated:**
- GT-IMS: Inventory Health agent

**Planned integrations:**
- GT-IMS: Monday Briefing agent
- Menu Autopilot: OCR Review, Menu Weekly Report agents
- SidelineIQ: Marketing, Curriculum agents

**Documentation:**
- Design: [docs/plans/2026-01-22-agent-learning-systems-design.md](docs/plans/2026-01-22-agent-learning-systems-design.md)
- Implementation: [docs/plans/2026-01-22-agent-learning-implementation.md](docs/plans/2026-01-22-agent-learning-implementation.md)
- Package README: [packages/agent-learning/README.md](packages/agent-learning/README.md)

## Tools

### Agent Dashboard

Web-based dashboard for monitoring agent performance across all projects.

**Location:** `tools/agent-dashboard/`

## Architecture: Hub and Spoke

This repository is the **hub**. Individual projects are **spokes** that import from the hub:

```
infrastructure (hub)
    ↓ imports
gt-ims, menu-autopilot, sidelineiq (spokes)
```

**Principles:**
- Shared infrastructure lives in the hub
- Domain-specific logic stays in spokes
- Hub is versioned and published as npm packages
- Spokes import from hub but remain independent

## Development

### Adding a new shared package

1. Create under `packages/`
2. Set up as npm package with `@clayparrish/` scope
3. Document in this README
4. Publish or use local linking during development

### Adding cross-project documentation

1. Create dated design doc in `docs/plans/YYYY-MM-DD-topic.md`
2. Link from relevant package READMEs
3. Commit to this repo

### Making changes

1. Changes to hub infrastructure affect all spokes
2. Consider backward compatibility
3. Version packages using semver
4. Update spoke projects after hub changes

## Projects Using This Infrastructure

- **GT-IMS** - Gallant Tiger Internal Management System
- **Menu Autopilot / AirTip** - Restaurant operations platform
- **SidelineIQ** - Youth sports coaching app
- **Dosie** - Medication management for caregivers
- **REPS** - Sales enablement platform

## Getting Started

```bash
# Clone the infrastructure repo
git clone <repo-url> infrastructure

# Install dependencies for packages (once packages are set up)
cd packages/agent-learning
npm install

# Link locally for development (alternative to publishing)
npm link
cd /path/to/gt-ims
npm link @clayparrish/agent-learning
```

## License

Private - Clay Parrish
