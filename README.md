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

Shared agent infrastructure enabling learning from past decisions:
- **Metrics tracking** - Performance measurement
- **Few-shot learning** - Learn from high-quality past recommendations
- **Experiment framework** - A/B testing with statistical validation
- **AgentKnowledge layer** - Cross-agent intelligence sharing

**Used by:**
- GT-IMS (Inventory Health, Monday Briefing agents)
- Menu Autopilot (OCR Review, Menu Weekly Report agents)
- SidelineIQ (Marketing, Curriculum agents)

**Design:** [docs/plans/2026-01-22-agent-learning-systems-design.md](docs/plans/2026-01-22-agent-learning-systems-design.md)

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
