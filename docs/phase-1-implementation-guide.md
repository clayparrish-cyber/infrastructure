# Phase 1 Implementation Guide - Must-Do Agents

**Date:** 2026-01-22
**Timeline:** Week 1-2
**Goal:** Core executive dashboard + research system + database optimization

---

## Phase 1 Agents

1. ✅ Business Analyst
2. ✅ Legal Advisor
3. ✅ Marketing Attribution Analyst
4. ✅ Deep Research Team (13 agents - replaces GT Research + Restaurant Research)
5. ✅ PostgreSQL DBA (or Neon Optimization Analyzer)

---

## Installation Commands

### 1. Business Analyst
```bash
npx claude-code-templates@latest --agent=business-marketing/business-analyst --yes
```

**What it does:** Business metrics analysis and reporting specialist. Creates Monday morning executive briefing across all ventures.

**Configuration needed:**
- Connect to GT-IMS, Menu Autopilot, AirTip, SidelineIQ, Dosie databases
- Define key metrics per venture (revenue, engagement, error rates, etc.)
- Set briefing schedule (Monday mornings)

---

### 2. Legal Advisor
```bash
npx claude-code-templates@latest --agent=business-marketing/legal-advisor --yes
```

**What it does:** Legal documentation and compliance specialist. Reviews marketing materials when Marketing escalates.

**Configuration needed:**
- Define escalation criteria for Marketing Agent:
  - New campaign types (never done before)
  - Product efficacy/safety/compliance claims
  - User-generated content features
  - International markets
  - NOT minor copy changes, A/B tests, or internal materials

---

### 3. Marketing Attribution Analyst
```bash
npx claude-code-templates@latest --agent=business-marketing/marketing-attribution-analyst --yes
```

**What it does:** Marketing attribution and performance analysis. Tracks which channels are working across all ventures.

**Configuration needed:**
- Connect to analytics (Google Analytics, Meta Ads, etc.)
- Define attribution model (first-touch, last-touch, or multi-touch)
- Set up tracking for:
  - GT-IMS: Marketing channels driving grocery orders
  - Menu Autopilot: Restaurant acquisition channels
  - SidelineIQ: Student acquisition and conversion
  - AirTip: Restaurant onboarding sources

---

### 4. Deep Research Team (13 Agents)

This replaces your GT Research Agent and Restaurant Research Agent with a coordinated multi-agent research system.

#### 4a. Research Coordinator (Required - orchestrates all research)
```bash
npx claude-code-templates@latest --agent=deep-research-team/research-coordinator --yes
```

#### 4b. Research Orchestrator (Required - coordinates complex projects)
```bash
npx claude-code-templates@latest --agent=deep-research-team/research-orchestrator --yes
```

#### 4c. Query Clarifier (Required - prevents wasted effort)
```bash
npx claude-code-templates@latest --agent=deep-research-team/query-clarifier --yes
```

#### 4d. Specialized Researchers (Choose based on needs)

**For GT-IMS (CPG/frozen retail intelligence):**
```bash
npx claude-code-templates@latest --agent=deep-research-team/competitive-intelligence-analyst --yes
npx claude-code-templates@latest --agent=deep-research-team/data-analyst --yes
npx claude-code-templates@latest --agent=deep-research-team/academic-researcher --yes
```

**For Menu Autopilot (restaurant industry trends):**
```bash
npx claude-code-templates@latest --agent=deep-research-team/competitive-intelligence-analyst --yes
npx claude-code-templates@latest --agent=deep-research-team/data-analyst --yes
```

**For SidelineIQ (youth sports market):**
```bash
npx claude-code-templates@latest --agent=deep-research-team/academic-researcher --yes
npx claude-code-templates@latest --agent=deep-research-team/data-analyst --yes
```

**For all ventures (quality control):**
```bash
npx claude-code-templates@latest --agent=deep-research-team/fact-checker --yes
```

#### 4e. Synthesis Layer (Required)
```bash
npx claude-code-templates@latest --agent=deep-research-team/research-synthesizer --yes
npx claude-code-templates@latest --agent=deep-research-team/report-generator --yes
npx claude-code-templates@latest --agent=deep-research-team/research-brief-generator --yes
```

#### Optional Deep Research Team Agents:
```bash
# If you need technical/code research (less likely for your ventures)
npx claude-code-templates@latest --agent=deep-research-team/technical-researcher --yes
```

**Configuration needed:**
- Define research domains per venture:
  - GT-IMS: CPG frozen food, retail distribution, UNFI/grocery channels
  - Menu Autopilot: QSR industry, restaurant tech, menu optimization
  - SidelineIQ: Youth sports, basketball training, education tech
  - AirTip: Tip pooling regulations, payroll compliance
  - Dosie: (Your existing domain knowledge)

- Set quality standards:
  - Minimum 3 sources per claim
  - Fact Checker validates before synthesis
  - Reports surface actionable insights, not raw data

---

### 5. PostgreSQL DBA (Database Optimization)

**Choose ONE:**

#### Option A: PostgreSQL DBA (if using standard Postgres)
```bash
npx claude-code-templates@latest --agent=data-ai/postgresql-dba --yes
```

#### Option B: Neon Optimization Analyzer (if using Neon)
```bash
npx claude-code-templates@latest --agent=data-ai/neon-optimization-analyzer --yes
```

**What it does:** Identifies and fixes slow queries automatically. Optimizes database performance.

**Configuration needed:**
- Connect to databases:
  - GT-IMS database
  - Menu Autopilot database
  - AirTip database
  - SidelineIQ database (if applicable)

- Set performance thresholds:
  - Queries slower than 200ms get flagged
  - Weekly optimization runs

---

## Integration with Existing Infrastructure

### Database Schema (Already Defined in Your Plans)

Your existing Prisma schemas already have these tables:
- `AgentTask` - Task execution tracking
- `AgentRecommendation` - Recommendations for human approval
- `AgentAlert` - Alerts requiring attention
- `AgentKnowledge` - Cross-agent intelligence (future)

**No schema changes needed for Phase 1.** These marketplace agents will write to your existing tables.

---

## Agent Communication Flows

### Flow 1: Monday Morning Executive Briefing
```
Sunday 10pm (automated):
  Business Analyst queries all venture databases
  ↓
  Aggregates metrics: revenue, engagement, errors, growth rates
  ↓
  Marketing Attribution Analyst provides channel performance
  ↓
  PostgreSQL DBA provides database health metrics
  ↓
  Business Analyst writes to AgentRecommendation table:
    - Priority: HIGH
    - Assigned to: Clay
    - Content: Executive briefing with key metrics
  ↓
Monday 8am:
  You open command-center dashboard
  You review briefing and set weekly priorities
```

### Flow 2: Marketing Campaign with Legal Review
```
Content Marketer drafts campaign for GT-IMS
  ↓
Marketing Agent evaluates against escalation criteria:
  - Is this a new campaign type? NO
  - Product claims? YES ("Reduces food waste by 50%")
  ↓
Marketing Agent escalates to Legal Advisor
  ↓
Legal Advisor reviews claim:
  - Is "50%" substantiated? Checks research
  - Recommends modification: "Helps reduce food waste"
  ↓
Marketing Agent revises campaign
  ↓
Writes to AgentRecommendation:
    - Priority: MEDIUM
    - Assigned to: Clay
    - Content: "Campaign ready for approval (Legal cleared)"
  ↓
You approve or modify
```

### Flow 3: Deep Research Request
```
You request: "Research UNFI's frozen shelf space expansion plans"
  ↓
Query Clarifier analyzes request:
  - Scope: UNFI frozen food category
  - Timeframe: Next 12 months
  - Outputs needed: Shelf space projections, competitive positioning
  ↓
Research Coordinator creates plan:
  - Task 1: Competitive Intelligence Analyst → Analyze UNFI vs competitors
  - Task 2: Data Analyst → Quantify shelf space growth rates
  - Task 3: Academic Researcher → Find industry reports
  - Task 4: Fact Checker → Verify all claims
  ↓
Researchers execute in parallel
  ↓
Research Synthesizer combines findings:
  - UNFI expanding frozen +15% over next year
  - Competitors (Kroger, Albertsons) expanding +8-10%
  - Opportunity for GT products
  ↓
Report Generator formats for executive dashboard
  ↓
Writes to AgentRecommendation:
    - Priority: HIGH
    - Assigned to: Clay
    - Content: Research report with actionable insights
  ↓
You review and decide next steps
```

---

## Configuration Files

### 1. Agent Config Template

Create `/Users/clayparrish/projects/infrastructure/config/agents/phase-1-config.ts`:

```typescript
export const phase1AgentConfig = {
  businessAnalyst: {
    ventures: ['gt-ims', 'menu-autopilot', 'airtip', 'sidelineiq', 'dosie'],
    briefingSchedule: 'Sunday 10pm',
    keyMetrics: {
      'gt-ims': ['revenue', 'inventory_turnover', 'stockout_rate', 'supplier_performance'],
      'menu-autopilot': ['mrr', 'restaurant_churn', 'menu_updates_per_week', 'engagement_rate'],
      'airtip': ['tip_processing_volume', 'ocr_error_rate', 'payroll_accuracy', 'restaurant_count'],
      'sidelineiq': ['student_count', 'lesson_completion_rate', 'subscription_revenue', 'referral_rate'],
      'dosie': ['feature_usage', 'bug_reports', 'user_satisfaction']
    },
    thresholds: {
      revenue_drop: 10, // Alert if revenue drops >10% week-over-week
      error_spike: 20,  // Alert if errors spike >20%
    }
  },

  legalAdvisor: {
    escalationCriteria: [
      'new_campaign_type',
      'product_efficacy_claims',
      'safety_compliance_claims',
      'user_generated_content',
      'international_markets',
      'pricing_discrimination_risk'
    ],
    excludeFromReview: [
      'minor_copy_changes',
      'email_subject_ab_tests',
      'internal_materials',
      'social_media_templates' // Unless new type
    ]
  },

  marketingAttributionAnalyst: {
    ventures: ['gt-ims', 'menu-autopilot', 'sidelineiq'],
    attributionModel: 'last_touch', // Or 'first_touch', 'multi_touch'
    channels: {
      'gt-ims': ['google_ads', 'instagram', 'referral', 'direct'],
      'menu-autopilot': ['google_ads', 'partnerships', 'referral', 'direct'],
      'sidelineiq': ['instagram', 'tiktok', 'referral', 'school_partnerships']
    },
    reportingFrequency: 'weekly'
  },

  deepResearchTeam: {
    sharedAcrossVentures: true, // One coordinator for all ventures
    researchDomains: {
      'gt-ims': ['cpg_frozen_food', 'retail_distribution', 'unfi', 'grocery_trends'],
      'menu-autopilot': ['qsr_industry', 'restaurant_tech', 'menu_optimization', 'pos_systems'],
      'sidelineiq': ['youth_sports', 'basketball_training', 'edtech', 'curriculum_design'],
      'airtip': ['tip_pooling_regulations', 'payroll_compliance', 'restaurant_labor'],
      'dosie': ['project_management', 'personal_productivity']
    },
    qualityStandards: {
      minimumSources: 3,
      requireFactChecking: true,
      outputFormat: 'executive_summary' // Not raw data dumps
    }
  },

  postgresqlDBA: {
    databases: [
      { name: 'gt-ims', connectionString: process.env.GT_IMS_DATABASE_URL },
      { name: 'menu-autopilot', connectionString: process.env.MENU_AUTOPILOT_DATABASE_URL },
      { name: 'airtip', connectionString: process.env.AIRTIP_DATABASE_URL },
      { name: 'sidelineiq', connectionString: process.env.SIDELINEIQ_DATABASE_URL }
    ],
    performanceThresholds: {
      slowQueryMs: 200,
      optimizationSchedule: 'weekly'
    }
  }
}
```

---

## Testing Phase 1 Agents

### Week 1: Installation & Basic Testing

**Day 1-2: Install all agents**
```bash
# Run all installation commands from above
# Verify agents are installed: ls ~/.claude/plugins/marketplaces/claude-plugins-official/plugins/
```

**Day 3: Test Business Analyst**
```bash
# Manually trigger Monday briefing (don't wait for Sunday)
# Should generate executive summary across all ventures
# Review output in command-center dashboard
```

**Day 4: Test Legal Advisor**
```bash
# Draft a marketing campaign with product claim
# Verify Marketing Agent escalates to Legal
# Verify Legal reviews and provides recommendation
```

**Day 5: Test Deep Research Team**
```bash
# Request: "Research restaurant POS system market trends"
# Verify Research Coordinator creates plan
# Verify researchers execute in parallel
# Verify Report Generator produces executive-ready output
```

### Week 2: Integration & Refinement

**Day 6-7: Integrate with Existing Agents**
- Connect Business Analyst to GT Inventory Agent (inventory metrics)
- Connect Business Analyst to Menu Analysis Agent (menu performance)
- Connect Business Analyst to AirTip OCR Validation Agent (error rates)

**Day 8-9: Configure Communication Flows**
- Set up Marketing → Legal escalation flow
- Set up Research Coordinator → You approval flow
- Set up Business Analyst → Monday briefing flow

**Day 10: End-to-End Test**
- Trigger Monday briefing
- Request research (test Deep Research Team)
- Create campaign (test Marketing → Legal flow)
- Review all outputs in command-center dashboard

---

## Success Metrics for Phase 1

**By end of Week 2, you should have:**

✅ **Monday morning briefing automatically generated**
- Shows key metrics across all 5 ventures
- Highlights anomalies and trends
- Surfaces top 3 priorities for the week

✅ **Marketing → Legal flow working**
- Marketing Agent correctly escalates based on criteria
- Legal reviews within 24 hours
- Recommendations surfaced to you for approval

✅ **Deep Research Team producing quality reports**
- Multi-agent coordination working
- Research is synthesized (not raw data dumps)
- Fact-checked and actionable

✅ **Database performance improved**
- PostgreSQL DBA identified slow queries
- Optimizations implemented
- Queries <200ms on average

✅ **Command Center dashboard showing all recommendations**
- Pending approvals visible
- Can approve/reject with reasoning
- Activity log working

---

## Troubleshooting

### Issue: Agents not writing to database
**Solution:** Verify Prisma schemas have AgentTask, AgentRecommendation, AgentAlert tables. Run migrations if needed.

### Issue: Business Analyst briefing is empty
**Solution:** Check database connections. Verify metrics exist in databases. May need to wait for data accumulation.

### Issue: Legal Advisor reviewing everything (bureaucratic bloat)
**Solution:** Refine escalation criteria in Marketing Agent config. Legal should only see 10-20% of campaigns.

### Issue: Deep Research Team reports are too long/unfocused
**Solution:** Adjust quality standards. Set max report length. Require executive summary at top.

### Issue: PostgreSQL DBA not finding slow queries
**Solution:** Lower performance threshold from 200ms to 100ms. May need more traffic to identify bottlenecks.

---

## Next Steps After Phase 1

Once Phase 1 is stable (Week 3):

1. **Evaluate Phase 1 impact:**
   - How much time saved per week?
   - Are recommendations high-quality?
   - Any agent communication issues?

2. **Plan Phase 2 (Innovation Funnel):**
   - Product Strategist
   - Task Decomposition Expert
   - Risk Manager

3. **Iterate based on learnings:**
   - Adjust agent prompts based on approval/rejection patterns
   - Refine escalation criteria
   - Optimize communication flows

---

## Installation Checklist

Use this checklist as you install Phase 1 agents:

- [x] Business Analyst installed (2026-01-23)
- [x] Legal Advisor installed (2026-01-23)
- [x] Marketing Attribution Analyst installed (2026-01-23)
- [x] Deep Research Team Coordinator installed (2026-01-23)
- [x] Deep Research Team Orchestrator installed (2026-01-23)
- [x] Deep Research Team Query Clarifier installed (2026-01-23)
- [x] Competitive Intelligence Analyst installed (2026-01-23)
- [x] Data Analyst installed (2026-01-23)
- [x] Academic Researcher installed (2026-01-23)
- [x] Fact Checker installed (2026-01-23)
- [x] Research Synthesizer installed (2026-01-23)
- [x] Report Generator installed (2026-01-23)
- [x] Research Brief Generator installed (2026-01-23)
- [x] Technical Researcher installed (2026-01-23) - bonus
- [x] PostgreSQL DBA installed (2026-01-23)
- [ ] Phase 1 config file created
- [ ] Database connections verified
- [ ] Monday briefing tested
- [ ] Marketing → Legal flow tested
- [ ] Deep Research Team tested
- [ ] Database optimization tested
- [ ] Command Center dashboard showing recommendations

---

**Ready to install? Run the commands above and check items off the list!**
