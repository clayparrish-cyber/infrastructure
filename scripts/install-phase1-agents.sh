#!/bin/bash

# Phase 1 Agent Installation Script
# Run this and walk away - all agents install automatically with --yes flag
# Estimated time: 5-10 minutes

echo "🚀 Starting Phase 1 agent installation..."
echo "Installing 19 agents total (5 categories)"
echo ""

# Business Marketing Agents
echo "📊 Installing Business Marketing agents (3/19)..."
npx claude-code-templates@latest --agent=business-marketing/business-analyst --yes
npx claude-code-templates@latest --agent=business-marketing/legal-advisor --yes
npx claude-code-templates@latest --agent=business-marketing/marketing-attribution-analyst --yes

# Deep Research Team (13 agents)
echo "🔬 Installing Deep Research Team (13/19)..."
npx claude-code-templates@latest --agent=deep-research-team/research-coordinator --yes
npx claude-code-templates@latest --agent=deep-research-team/research-orchestrator --yes
npx claude-code-templates@latest --agent=deep-research-team/query-clarifier --yes
npx claude-code-templates@latest --agent=deep-research-team/competitive-intelligence-analyst --yes
npx claude-code-templates@latest --agent=deep-research-team/data-analyst --yes
npx claude-code-templates@latest --agent=deep-research-team/academic-researcher --yes
npx claude-code-templates@latest --agent=deep-research-team/fact-checker --yes
npx claude-code-templates@latest --agent=deep-research-team/research-synthesizer --yes
npx claude-code-templates@latest --agent=deep-research-team/report-generator --yes
npx claude-code-templates@latest --agent=deep-research-team/research-brief-generator --yes
npx claude-code-templates@latest --agent=deep-research-team/technical-researcher --yes

# PostgreSQL DBA
echo "💾 Installing Database Optimization agent (1/19)..."
npx claude-code-templates@latest --agent=data-ai/postgresql-dba --yes

echo ""
echo "✅ Phase 1 installation complete!"
echo "Installed 19 agents:"
echo "  - Business Analyst"
echo "  - Legal Advisor"
echo "  - Marketing Attribution Analyst"
echo "  - Deep Research Team (13 agents)"
echo "  - PostgreSQL DBA"
echo ""
echo "Next steps:"
echo "1. Create configuration file: config/agents/phase-1-config.ts"
echo "2. Run test: claude -> /monday-briefing"
echo "3. Check installation: ls ~/.claude/plugins/marketplaces/claude-plugins-official/plugins/"
