# Agent Marketplace Evaluation

**Date:** 2026-01-22
**Source:** https://www.aitmpl.com/agents
**Total Agents Reviewed:** 310
**Evaluation Framework:** Not Relevant | Not Worth It | Potential Overlap | Likely Implement | Definitely Implement

---

## Executive Summary

The marketplace offers 310 agents across various categories. Based on your vision of executive-level oversight with autonomous agent teams, I've identified **23 high-priority agents** that align with your "digital CEO dashboard" vision where agents handle research, recommendations, and small decisions while you approve major strategic moves.

**Key Findings:**
- **Legal Advisor** agent exists (you mentioned wanting this!)
- Strong Business/Marketing category with agents that enable cross-functional collaboration
- Deep Research and AI Specialist agents that fit your "top of funnel" innovation approach
- Payment and integration specialists for AirTip and Menu Autopilot
- Several agents have **potential overlap** with your existing infrastructure (GT Briefing, Menu Analysis, etc.)

---

## DEFINITELY IMPLEMENT

### 1. Legal Advisor (Business Marketing)
**Why:** You specifically mentioned wanting marketing to check with legal before campaigns. This agent provides exactly that capability.

**Capabilities:**
- Privacy policies, terms of service, GDPR compliance
- Legal documentation review
- Proactive compliance checking

**Implementation Plan:**
- Add to all ventures (GT-IMS, Menu Autopilot, AirTip, SidelineIQ)
- Configure to review marketing materials before campaigns launch
- Set up cross-agent communication: Marketing Agent → Legal Advisor → Approval to you

**Priority:** IMMEDIATE - Aligns perfectly with your vision of agents consulting each other

---

### 2. Product Strategist (Business Marketing)
**Why:** This is your "innovation funnel" agent - helps generate volume of ideas at top of funnel, narrow to 2-5 finalists.

**Capabilities:**
- Product positioning and market analysis
- Feature prioritization
- Roadmap planning

**Implementation Plan:**
- Primary agent for SidelineIQ curriculum roadmap
- Secondary agent for Menu Autopilot feature planning
- Configured to surface 2-5 candidates after rigorous research (exactly your process)

**Priority:** HIGH

---

### 3. Marketing Attribution Analyst (Business Marketing)
**Why:** Tracks what's working across all ventures. Critical for your "learn enough to keep going" approach.

**Capabilities:**
- Campaign tracking
- Attribution modeling
- Performance analysis

**Implementation Plan:**
- GT-IMS: Track which marketing channels drive grocery orders
- Menu Autopilot: Track restaurant acquisition channels
- SidelineIQ: Track student acquisition and conversion
- Surfaces insights to Business Analyst for executive dashboard

**Priority:** HIGH

---

### 4. Business Analyst (Business Marketing)
**Why:** Your daily "financial results/dashboards" check-in. Aggregates metrics across all ventures.

**Capabilities:**
- KPI tracking
- Revenue analysis
- Growth projections

**Implementation Plan:**
- Creates your Monday morning executive briefing across all ventures
- Queries data from GT-IMS, Menu Autopilot, AirTip, SidelineIQ, Dosie
- Surfaces: revenue trends, key metrics, anomalies requiring attention
- Replaces/enhances your existing Monday Briefing agent

**Priority:** IMMEDIATE - Core to CEO dashboard vision

---

### 5. Task Decomposition Expert (AI Specialists)
**Why:** Breaks complex goals into multi-step projects. Perfect for your "top of funnel → 3-5 tests → 1 launch" process.

**Capabilities:**
- Complex goal breakdown
- Multi-step project planning
- Identifies different capabilities needed

**Implementation Plan:**
- Works with Product Strategist to break down ideas into testable hypotheses
- Creates action plans for the 3-5 finalists
- Surfaces resource requirements and risk assessment

**Priority:** HIGH

---

### 6. Content Marketer (Business Marketing)
**Why:** Autonomous content generation for all ventures. Frees you from execution weeds.

**Capabilities:**
- Blog posts, social media content
- Email campaigns
- SEO optimization

**Implementation Plan:**
- GT-IMS: Recipe content, frozen food tips
- Menu Autopilot: Restaurant industry insights
- SidelineIQ: Basketball training content
- Checks with Legal Advisor before publishing

**Priority:** HIGH

---

## LIKELY IMPLEMENT

### 7. Search Specialist (AI Specialists)
**Why:** Powers your Deep Research agents. Expert at finding non-obvious insights.

**Capabilities:**
- Advanced search techniques
- Result filtering and synthesis
- Masters search operators

**Implementation Plan:**
- Enhances GT Research Agent (CPG/frozen retail intelligence)
- Enhances Restaurant Research Agent
- Provides competitive intelligence

**Overlap Assessment:** May overlap with existing Research agents, but likely MORE capable

**Priority:** MEDIUM-HIGH

---

### 8. Risk Manager (Business Marketing)
**Why:** Helps you stay conservative on spending while adventurous on ideas.

**Capabilities:**
- Portfolio risk assessment
- Position sizing
- Risk analysis

**Implementation Plan:**
- Reviews experiments before launch
- Assesses financial exposure of 3-5 finalist ideas
- Flags when you're approaching budget limits
- Aligned with "we can't burn money" constraint

**Priority:** MEDIUM-HIGH

---

### 9. Payment Integration (Business Marketing)
**Why:** Critical for AirTip and Menu Autopilot payment flows.

**Capabilities:**
- Stripe, PayPal implementation
- Payment processor integration
- Checkout optimization

**Implementation Plan:**
- AirTip: Tip payout optimization
- Menu Autopilot: Restaurant subscription billing

**Overlap Assessment:** You may already have payment code, but this agent can optimize/maintain it

**Priority:** MEDIUM

---

### 10. Customer Support (Business Marketing)
**Why:** Scales support for Menu Autopilot and SidelineIQ as they grow.

**Capabilities:**
- Support ticket responses
- FAQ creation
- Troubleshooting guides

**Implementation Plan:**
- Menu Autopilot: Restaurant owner support
- SidelineIQ: Student/parent support
- Drafts responses for your review (you approve before sending)

**Priority:** MEDIUM

---

### 11. Sales Automator (Business Marketing)
**Why:** Automates outreach for Menu Autopilot and SidelineIQ.

**Capabilities:**
- Cold email campaigns
- Follow-up sequences
- Proposal templates

**Implementation Plan:**
- Menu Autopilot: Restaurant outreach
- SidelineIQ: School/league partnerships
- Drafts campaigns, Legal reviews, you approve

**Priority:** MEDIUM

---

### 12. Prompt Engineer (AI Specialists)
**Why:** Improves all your other agents over time.

**Capabilities:**
- Prompt optimization for LLMs
- Agent performance improvement
- Few-shot learning enhancement

**Implementation Plan:**
- Meta-agent that improves your agent infrastructure
- Reviews agent recommendation quality
- Suggests prompt improvements for higher approval rates
- Aligns with your Agent Learning Systems design

**Priority:** MEDIUM

---

### 13. Model Evaluator (AI Specialists)
**Why:** Cost optimization as you scale agent usage.

**Capabilities:**
- Model selection (Haiku vs Sonnet vs Opus)
- Performance comparison
- Cost analysis

**Implementation Plan:**
- Determines which agents can run on cheaper models
- Validates that Haiku is sufficient for operational tasks
- Tracks token usage across ventures

**Priority:** MEDIUM (becomes HIGH when you move to API agents)

---

### 14. AI Ethics Advisor (AI Specialists)
**Why:** Ensures your agents don't develop harmful biases, especially important for SidelineIQ (education).

**Capabilities:**
- Bias assessment
- Fairness evaluation
- Ethical AI development

**Implementation Plan:**
- Reviews SidelineIQ curriculum recommendations for bias
- Reviews Menu Autopilot pricing recommendations for fairness
- Quarterly audit of all agent decisions

**Priority:** MEDIUM

---

## OVERLAP EVALUATION COMPLETE - SEE FULL ANALYSIS

**Full details in:** `/Users/clayparrish/projects/infrastructure/docs/overlap-analysis-deep-dive.md`

### 15. Deep Research Team - REPLACE YOUR EXISTING AGENTS ✅

**Verdict:** Marketplace Deep Research Team is objectively better than your current research agents.

**What They Offer:**
- Research Coordinator (plans multi-agent research)
- Specialized researchers (Competitive Intelligence, Academic, Technical, Data Analyst)
- Quality controls (Fact Checker, Query Clarifier)
- Synthesis layer (combines findings into executive-ready reports)

**vs Your Current:**
- Single-purpose agents (GT Research, Restaurant Research)
- No coordination, no specialization, no quality controls

**Recommendation:** Replace GT Research Agent and Restaurant Research Agent with Deep Research Team

**Priority:** IMMEDIATE (Phase 1)

---

### 16. OCR Extraction Team - ENHANCE YOUR EXISTING AGENT ✅

**Verdict:** Keep your AirTip OCR Validation Agent, ADD marketplace OCR pipeline for quality improvement.

**What They Offer:**
- Pre-processing (image enhancement, noise reduction)
- Grammar fixing (corrects common OCR errors)
- Quality assurance (validates before final check)

**vs Your Current:**
- You only validate AFTER OCR is done
- Marketplace improves quality BEFORE and DURING OCR

**Recommendation:** Add OCR Preprocessing Optimizer, OCR Grammar Fixer, OCR Quality Assurance to pipeline

**Expected Impact:** 75% reduction in manual OCR review workload

**Priority:** MEDIUM (Phase 3)

---

### 17. Data AI Agents - SELECTIVELY ADD (PHASED) ✅

**Verdict:** Add database optimization NOW. Add analytics when you have historical data (6+ months).

**Immediate (Phase 1):**
- PostgreSQL DBA or Neon Optimization Analyzer - Optimize slow queries

**Month 6 (Phase 5):**
- Data Scientist - Time series forecasting, advanced segmentation (ONLY when you have 6-12 months of data)

**Month 12+ (Only if needed):**
- ML Engineer - ONLY if simpler statistical approaches aren't sufficient

**Recommendation:** Start with database optimization, wait for data before adding Data Scientist

**Priority:** Database optimization = IMMEDIATE, Data Scientist = Month 6

---

## NOT WORTH IT (For Current Stage)

### 18. Blockchain/Web3 Specialists
**Why:** None of your ventures are Web3-focused. GT, Menu Autopilot, AirTip, SidelineIQ, Dosie are all traditional SaaS/physical product businesses.

**Agents:** Smart Contract Auditor, Smart Contract Specialist, Web3 Integration Specialist

**Decision:** Skip for now. Revisit if you pivot to Web3.

---

### 19. Game Development Agents
**Why:** Not applicable to your ventures.

**Decision:** Skip entirely.

---

### 20. Podcast Creator Team
**Why:** No current podcast strategy for any venture.

**Decision:** Skip for now. Could revisit if content strategy expands to audio.

---

### 21. Hackathon AI Strategist
**Why:** Not running hackathons currently.

**Decision:** Skip unless you plan to host events.

---

## NOT RELEVANT

### 22. Salesforce Expert
**Why:** You don't appear to be using Salesforce CRM based on your infrastructure docs (using Prisma/Postgres).

**Decision:** Skip entirely.

---

### 23. Ffmpeg Clip Team
**Why:** No video processing requirements in current ventures.

**Decision:** Skip entirely.

---

### 24. Modernization / Legacy Code Agents
**Why:** Your codebases are modern (Next.js, React, TypeScript, Prisma). No legacy systems to modernize.

**Decision:** Skip entirely.

---

## UPDATED IMPLEMENTATION ROADMAP

### Phase 1: Core Executive Dashboard + Research System (IMMEDIATE - Week 1-2)
**Goal:** Get your "sit down and check dashboards/approvals" workflow running + replace research agents

**Must-Do Agents:**
1. **Business Analyst** - Monday morning executive briefing across all ventures
2. **Legal Advisor** - Enable cross-agent legal checks (Marketing escalates based on criteria)
3. **Marketing Attribution Analyst** - Track what's working across channels

**Replace Existing Agents:**
4. **Deep Research Team** - REPLACE GT Research Agent and Restaurant Research Agent with coordinated multi-agent research system

**Database Optimization:**
5. **PostgreSQL DBA** or **Neon Optimization Analyzer** - Optimize slow queries, reduce cloud costs

**Timeline:** Week 1-2
**Expected Impact:** Daily CEO visibility, legal oversight, vastly improved research quality, faster database performance

---

### Phase 2: Innovation Funnel (Month 1)
**Goal:** Enable quality-based innovation pipeline (ideas that pass quality bar, no quotas)

6. **Product Strategist** - Idea generation and prioritization (quality over quotas)
7. **Task Decomposition Expert** - Break ideas into testable hypotheses
8. **Risk Manager** - Assess financial exposure (keep experiments under $1,000)

**Timeline:** Month 1
**Expected Impact:** Quality-based innovation pipeline, smarter bets within budget constraints

---

### Phase 3: Content & Marketing Automation (Month 2)
**Goal:** Free you from marketing execution weeds

9. **Content Marketer** - Autonomous content generation (shared across ventures)
10. **Sales Automator** - Outreach campaigns for Menu Autopilot and SidelineIQ
11. **Customer Support** - Support ticket handling (drafts for your approval)

**Timeline:** Month 2
**Expected Impact:** Marketing and support running autonomously with your approval

---

### Phase 4: OCR Pipeline Enhancement (Month 2-3)
**Goal:** Reduce AirTip manual OCR review workload by 75%

12. **OCR Preprocessing Optimizer** - Image enhancement before OCR service
13. **OCR Grammar Fixer** - Correct common OCR errors automatically
14. **OCR Quality Assurance** - Final validation before flagging to you

**Timeline:** Month 2-3
**Expected Impact:** 75% reduction in manual receipt review (from 20% flagged to 5% flagged)

---

### Phase 5: Agent Quality & Cost Optimization (Month 3)
**Goal:** Improve agent recommendations and optimize costs

15. **Prompt Engineer** - Improve agent approval rates
16. **Model Evaluator** - Optimize costs when moving to API agents (Haiku vs Sonnet)
17. **Search Specialist** - Enhanced research capabilities (if Deep Research Team needs boost)

**Timeline:** Month 3
**Expected Impact:** Higher quality recommendations, lower costs when scaling

---

### Phase 6: Advanced Analytics (Month 6+, ONLY when you have data)
**Goal:** Predictive analytics and ML (only if rule-based approaches aren't sufficient)

18. **Data Scientist** - Time series forecasting, advanced segmentation
  - GT-IMS: Seasonal demand forecasting, dynamic reorder points
  - Menu Autopilot: Price elasticity analysis, customer segmentation
  - AirTip: Anomaly detection in tip distributions

19. **ML Engineer** - ONLY if Data Scientist identifies need for ML models (Month 12+)

**Timeline:** Month 6+ (wait for historical data)
**Expected Impact:** Better forecasting, reduced waste, optimized pricing

---

## CROSS-AGENT COMMUNICATION PATTERNS

Based on your vision, here are recommended communication flows:

### Marketing Campaign Launch Flow
```
Content Marketer drafts campaign
  ↓
Legal Advisor reviews for compliance
  ↓
Risk Manager assesses financial exposure
  ↓
Business Analyst projects ROI
  ↓
Surface to YOU for approval
  ↓
If approved → Campaign launches
```

### Product Feature Ideation Flow
```
Product Strategist generates 100 ideas
  ↓
Task Decomposition Expert breaks down top 20
  ↓
Risk Manager filters to 10 low-cost tests
  ↓
Search Specialist researches 10 ideas
  ↓
Product Strategist narrows to 3-5 finalists
  ↓
Business Analyst projects impact
  ↓
Surface to YOU with detailed analysis
  ↓
You select 1-2 to test
```

### Weekly Executive Briefing Flow
```
Business Analyst aggregates metrics across ventures
  ↓
Marketing Attribution Analyst provides channel performance
  ↓
Risk Manager flags emerging risks
  ↓
Product Strategist summarizes experiments in flight
  ↓
Combined into single Monday morning briefing
  ↓
YOU review and set weekly priorities
```

---

## COST CONSIDERATIONS

**Your Constraint:** "Can't burn money" - conservative on spending, adventurous on ideas

**Agent Cost Structure (Claude Code Agents):**
- Currently: Included in Claude Max subscription ($100-200/month)
- Future API: Will need budget caps

**Recommendations:**
1. Start with 3-5 agents (Phase 1) to validate approach
2. All agents write recommendations to DB, you approve in dashboard
3. Monitor token usage before scaling to all 13 "Definitely/Likely Implement" agents
4. When moving to API: Start with $50/month budget cap (your plan already accounts for this)

**Expected ROI:**
- Time saved: 10-20 hours/week across ventures
- Better decisions: Agents research 80% clarity threshold faster than you can manually
- Reduced risk: Legal and Risk agents catch issues before they're expensive

---

## DECISION FRAMEWORK

**When evaluating additional agents, ask:**

1. **Does it save executive time?** (Yes = valuable)
2. **Does it enable agent-to-agent collaboration?** (Yes = aligns with vision)
3. **Does it reduce financial risk?** (Yes = fits "can't burn money" constraint)
4. **Does it improve decision quality?** (Yes = worth it)
5. **Does it overlap with existing agents?** (Yes = evaluate carefully)

---

## QUESTIONS ANSWERED ✅

1. **Scope of Legal Advisor:** ✅ Legal does NOT review based on budget. Marketing has sophisticated evaluation criteria for when to escalate (new campaign types, compliance claims, international markets, etc.). Legal only reviews what Marketing escalates.

2. **Product Strategist Tuning:** ✅ NO quotas. Quality bar only. If 20 ideas pass quality bar, surface all 20. If 2 pass, surface 2. Ideas compete and win on merit, not to fill a funnel.

3. **Business Analyst Frequency:** ✅ Monday morning briefing.

4. **Risk Manager Thresholds:** ✅ Keep experiments under $1,000. Total monthly spend across all subscriptions/agents/marketing should stay under $1,000.

5. **Customer Support Autonomy:** ✅ Draft responses for your approval (agents recommend, you decide).

6. **Cross-Venture Knowledge Sharing:** ✅ Agents work the most efficient way. Domain-agnostic agents (Research, Legal, Content) can be shared. Domain-specific agents (Analytics) should be venture-specific if complexity would explode with shared agent.

---

## NEXT STEPS

### Immediate (This Week):
1. Review this evaluation
2. Answer open questions above
3. Decide on Phase 1 agents (Business Analyst, Legal Advisor, Marketing Attribution Analyst)

### Week 2:
4. Install Phase 1 agents from marketplace
5. Configure agent-to-agent communication (Marketing → Legal flow)
6. Test with one real campaign

### Week 3-4:
7. Evaluate overlap agents (Deep Research, OCR, Data AI)
8. Plan Phase 2 implementation (Product Strategist, Task Decomposition, Risk Manager)

---

## REFINED AGENT PHILOSOPHY

Based on your clarifications, here's the operating model:

### Think "Best-in-Class Individual Contributors" Not "Teams"

**Why This Matters:**
- Avoids bureaucratic bloat and scope drift
- Each agent is a world-class specialist with clear accountability
- Agents outsource EXECUTION tasks (not decisions) to "contractors" when needed
- Creates a flexible network that lives and breathes

**Example:**
- **Content Marketer** = Senior marketer (makes campaign decisions)
  - Outsources copywriting execution to Content Marketer "contractors"
  - Outsources design to Design "contractors"
  - But owns the strategy and campaign approval

- **Legal Advisor** = General Counsel (makes legal risk assessments)
  - Doesn't review everything (that's bureaucracy)
  - Reviews what Marketing escalates based on criteria

### Agent Decision-Making Criteria

**Marketing Deciding When to Escalate to Legal:**
```
Marketing Agent reviews campaign internally for:
- Budget optimization
- Channel selection
- Brand consistency
- ROI projection

Marketing Agent escalates to Legal when:
- New campaign type never done before
- Claims about product efficacy/safety/compliance
- User-generated content features
- International markets (different regulations)

Legal does NOT review:
- Minor copy changes
- Social media posts following existing templates
- Email subject line A/B tests
- Internal materials
```

**This Applies to ALL Agent Collaboration:**
- Agents have sophisticated understanding of their domain
- Agents have neutral evaluation criteria for escalation
- Empowered to build fast, take chances, grow business
- Not prone to bureaucratic bloat (because well-designed prompts)

### Quality Over Quotas

**Innovation Funnel:**
❌ "Generate 100 ideas, narrow to 10, test 3-5, launch 1" (QUOTA-BASED)
✅ "Generate ideas that pass quality bar. If 20 pass, great. If 2 pass, also great." (QUALITY-BASED)

**Product Strategist Configuration:**
```markdown
Quality Bar:
- Aligns with venture mission
- Addresses validated user problem
- Feasible within resource constraints
- Has clear success metrics
- Passes 80% clarity threshold

If 20 ideas pass quality bar this month → Surface all 20 to Clay
If 2 ideas pass quality bar next month → Surface 2 to Clay

NEVER force ideas just to hit quota.
Volume at top of funnel is good, but only IDEAS THAT WIN on merit.
```

### Budget Accountability

**$1,000/month total constraint includes:**
- ChatGPT: ~$20/month
- Gemini: ~$20/month
- Claude Max: $100/month
- Veo: ~$20/month
- Other subscriptions: ~$40/month
- **Current baseline: ~$200/month**

**Marketing budgets are small to start:**
- SidelineIQ: Self-funded, minimal ad spend
- Dosie: Self-funded, minimal ad spend
- GT-IMS, Menu Autopilot, AirTip: Pre-revenue but have partners/funding

**Who Handles Budget:**
- **Marketing Agent** tracks campaign budgets, optimizes spend
- **Business Analyst** surfaces budget anomalies to you
- **Risk Manager** flags when experiments exceed cost thresholds
- **Legal** does NOT evaluate budget (that's Marketing's job)

### Agent Sharing vs Specialization

**Guideline:**
- **Domain-agnostic roles** (Research, Legal, Content) → Share across ventures
  - One Research Coordinator handles GT, Menu Autopilot, SidelineIQ research
  - One Legal Advisor reviews across all ventures
  - One Content Marketer generates content for all ventures

- **Domain-specific roles** (Analytics, Product Strategy) → Separate per venture
  - GT-IMS Business Analyst (inventory, supplier metrics)
  - Menu Autopilot Business Analyst (restaurant engagement, churn)
  - AirTip Business Analyst (tip processing, error rates)

- **Tipping Point:** When single agent prompt exceeds 1000 lines, split it

**Efficiency Trumps Organization Chart:**
- If a researcher can handle all ventures efficiently → One researcher
- If complexity explodes → Split into venture-specific researchers
- Flexible network, not rigid hierarchy

---

## ALIGNMENT WITH YOUR VISION

**Your Vision:** "Sit down at computer, check approvals/questions/dashboards/financial results, make key decisions, ask follow-up questions like a CEO."

**How These Agents Enable It:**

✅ **Business Analyst** = Your financial results dashboard
✅ **Legal Advisor** = Cross-agent collaboration (marketing checks with legal based on criteria)
✅ **Product Strategist** = Quality-based innovation funnel (no quotas, just winners)
✅ **Risk Manager** = Smart risk-taking within $1,000/month constraint
✅ **Task Decomposition Expert** = Rigorous research of finalists
✅ **Marketing Attribution Analyst** = "Learn enough to keep going" data
✅ **Content Marketer** = Execution happens without you
✅ **Sales Automator** = Autonomous prospecting
✅ **Customer Support** = Scale without hiring
✅ **Deep Research Team** = Best-in-class researchers with specialized expertise

**Your Ethos: "Do it clunky, do it early, do it scared. 80% clarity is enough."**

These agents are designed to GET you to 80% clarity faster, then surface decisions to you. They won't wait for 95%+ certainty. They'll take smart risks (with Risk Manager oversight) and iterate quickly.

---

**End of Evaluation**
