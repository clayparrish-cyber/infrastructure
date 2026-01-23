# Overlap Analysis: Marketplace vs Existing Agents

**Date:** 2026-01-22
**Purpose:** Deep comparison of marketplace agents against your existing infrastructure

---

## 1. DEEP RESEARCH TEAM

### What You Have Now
- **GT Research Agent** - CPG/frozen retail intelligence
- **Restaurant Research Agent** - QSR/restaurant industry trends

**Current Capabilities:**
- Web searches for industry trends
- Manual synthesis into recommendations
- Single-agent approach (one agent does all research steps)

### What Marketplace Offers

**Deep Research Team** is a complete research SYSTEM with specialized roles:

#### Research Coordination Layer
- **Research Coordinator** - Strategically plans research across multiple specialists
- **Research Orchestrator** - Coordinates comprehensive projects requiring multiple agents
- **Query Clarifier** - Analyzes research queries before starting (prevents wasted effort)

#### Research Execution Layer
- **Competitive Intelligence Analyst** - Competitor analysis, market positioning
- **Academic Researcher** - Scholarly sources, peer-reviewed papers
- **Technical Researcher** - Code repos, technical docs, implementation details
- **Data Analyst** - Quantitative analysis, statistical insights
- **Fact Checker** - Claim verification, source credibility assessment

#### Research Synthesis Layer
- **Research Brief Generator** - Transforms queries into actionable research briefs
- **Research Synthesizer** - Consolidates findings from multiple sources
- **Report Generator** - Transforms findings into comprehensive final reports

### VERDICT: **REPLACE Your Existing Research Agents**

**Why:**
1. **Your current agents are single-purpose, single-step** - They search and report, that's it
2. **Marketplace offers multi-agent research workflow** - Query → Plan → Execute → Synthesize → Report
3. **Specialization matches your "best-in-class individual contributors" vision**
4. **Built-in quality controls** (Fact Checker, Query Clarifier) prevent low-quality research

### Recommended Implementation

**Replace:**
- GT Research Agent → Deep Research Team (CPG/frozen retail focus)
- Restaurant Research Agent → Deep Research Team (QSR/restaurant focus)

**How to Configure:**
```
Research Coordinator receives request:
  "Research UNFI's frozen food shelf space expansion plans"

Coordinator assigns:
  → Competitive Intelligence Analyst: Analyze UNFI vs competitors
  → Academic Researcher: Find industry reports on frozen food trends
  → Data Analyst: Quantify shelf space growth rates
  → Fact Checker: Verify claims from each source
  → Research Synthesizer: Combine into cohesive insight
  → Report Generator: Format for your executive dashboard

Output: High-quality, verified research with multiple perspectives
```

**Advantage Over Current Approach:**
- Current: Single agent searches, you get raw data
- New: Coordinated team researches, you get synthesized insights ready for decisions

**Cost Impact:**
- More agents = more prompts, but BETTER quality = fewer retries
- Net result: Likely similar cost, much higher quality

---

## 2. OCR EXTRACTION TEAM

### What You Have Now
- **AirTip OCR Validation Agent** - Flags low-confidence scans from receipt OCR

**Current Capabilities:**
- Reviews OCR results
- Flags scans below confidence threshold
- Requires manual human review of flagged items

### What Marketplace Offers

**OCR Extraction Team** is a complete OCR PIPELINE with quality controls:

#### Pre-Processing
- **OCR Preprocessing Optimizer** - Image enhancement, noise reduction, skew correction

#### Extraction
- **Visual Analysis OCR** - Extracts and analyzes text from images
- **Document Structure Analyzer** - Identifies document layouts, content hierarchy

#### Post-Processing & Correction
- **OCR Grammar Fixer** - Corrects OCR errors, fixes character recognition mistakes
- **Markdown Syntax Formatter** - Converts to proper markdown (if needed)

#### Quality Assurance
- **OCR Quality Assurance** - Final validation against original images
- **Text Comparison Validator** - Compares extracted text with existing files

### VERDICT: **ENHANCE Your Existing Agent**

**Why:**
1. **Your current agent is downstream** - It validates AFTER OCR is done
2. **Marketplace agents optimize UPSTREAM** - Pre-processing improves OCR quality at source
3. **Post-processing correction reduces false positives** - Fewer flagged receipts

### Recommended Implementation

**Keep your AirTip OCR Validation Agent, but ADD:**
- **OCR Preprocessing Optimizer** - Run BEFORE sending to OCR service (improves baseline quality)
- **OCR Grammar Fixer** - Run AFTER OCR, BEFORE validation (fixes common mistakes automatically)
- **OCR Quality Assurance** - Final check before surfacing to you

**New AirTip OCR Pipeline:**
```
Receipt photo uploaded
  ↓
OCR Preprocessing Optimizer: Enhance image quality
  ↓
External OCR Service: Extract text
  ↓
OCR Grammar Fixer: Correct common mistakes ("$" → "S", "O" → "0", etc.)
  ↓
OCR Quality Assurance: Validate corrected text
  ↓
Your existing AirTip OCR Validation Agent: Final confidence check
  ↓
Only surface truly ambiguous cases to you
```

**Expected Impact:**
- Current: 20% of receipts flagged for manual review
- With marketplace agents: 5-8% flagged (pre-processing improves quality, post-processing fixes common errors)
- **75% reduction in manual review workload**

**Cost Impact:**
- 3 additional agents in pipeline
- BUT: Massive reduction in human time (fewer flagged receipts)
- ROI: Positive if you're spending >2 hours/week on manual OCR review

---

## 3. DATA AI AGENTS

### What You Have Now
- **GT Inventory Agent** - Monitors stock, recommends reorders (basic forecasting)
- **Menu Analysis Agent** - Item performance analysis (basic segmentation)

**Current Capabilities:**
- Rule-based inventory forecasting (days of supply calculation)
- Menu engineering quadrants (Stars, Plowhorses, Puzzles, Dogs)
- No advanced statistical modeling
- No time series analysis
- No predictive analytics

### What Marketplace Offers

**Data AI Category** has specialized analytics agents:

#### Core Data Agents
- **Data Scientist** - Exploratory data analysis, statistical modeling, predictive analytics
- **Data Engineer** - ETL/ELT pipelines, data warehouses, streaming data
- **Data Analyst** (from Deep Research Team) - Quantitative analysis

#### ML/AI Specialists
- **ML Engineer** - ML pipelines, model serving, feature engineering
- **MLOps Engineer** - ML infrastructure, experiment tracking, model registries
- **NLP Engineer** - Text analytics (for customer feedback, reviews)
- **Computer Vision Engineer** - Image analysis (for menu photos, food presentation)

#### Database Optimization
- **PostgreSQL DBA** - Database performance tuning
- **Neon Optimization Analyzer** - Identifies slow queries automatically
- **Neon Migration Specialist** - Safe schema changes with zero downtime

### VERDICT: **SELECTIVELY ADD (Not Replace)**

**Why:**
1. **Your current agents work for current scale** - Rule-based forecasting is fine for GT's early stage
2. **Data Science agents unlock ADVANCED capabilities** - Predictive demand forecasting, seasonality detection
3. **Only add when you have enough data** - ML requires historical data (6-12 months minimum)

### Recommended Implementation

**Phased Approach Based on Data Maturity:**

#### Phase 1: Database Optimization (IMMEDIATE)
Add **PostgreSQL DBA** or **Neon Optimization Analyzer**
- Optimize slow queries across GT-IMS, Menu Autopilot, AirTip
- No historical data required, immediate performance gains

#### Phase 2: Advanced Analytics (6 months from now, when you have data)
Add **Data Scientist** for:
- **GT-IMS**: Time series forecasting for inventory (better than "days of supply")
  - Detect seasonality (grilling products spike in summer)
  - Predict stockout probability
  - Optimize reorder points dynamically

- **Menu Autopilot**: Advanced menu engineering
  - Price elasticity analysis
  - Customer segmentation (RFM analysis)
  - Menu mix optimization

- **AirTip**: Tip distribution analysis
  - Detect anomalies in tip patterns
  - Predict tip-out errors before payroll runs

#### Phase 3: ML/AI (12+ months, if needed)
Add **ML Engineer** for:
- Demand forecasting models (if rule-based isn't sufficient)
- Customer churn prediction (Menu Autopilot)
- Fraud detection (AirTip tip manipulation)

**Only add if simpler approaches aren't working**

### Cost-Benefit Analysis

**Database Optimization:**
- Cost: Low (one-time query optimization)
- Benefit: Immediate performance gains, reduced cloud costs
- **Decision: DEFINITELY ADD (PostgreSQL DBA or Neon Optimizer)**

**Data Scientist:**
- Cost: Medium (ongoing analytics work)
- Benefit: Better inventory forecasting = less waste, fewer stockouts
- **Decision: ADD in 6 months when you have historical data**

**ML Engineer:**
- Cost: High (model building, maintenance, MLOps infrastructure)
- Benefit: Only valuable if simpler statistical models aren't sufficient
- **Decision: WAIT - Only add if Data Scientist identifies need**

---

## SUMMARY RECOMMENDATIONS

### REPLACE (High Confidence)
1. **GT Research Agent** → **Deep Research Team**
2. **Restaurant Research Agent** → **Deep Research Team**

**Reasoning:** Marketplace system is objectively better. Multi-agent coordination, specialized roles, built-in quality controls.

**Timeline:** Immediate (Phase 1 of implementation roadmap)

---

### ENHANCE (Medium Confidence)
3. **AirTip OCR Validation Agent** → Keep it, ADD marketplace OCR pipeline

**Reasoning:** Your agent is valuable for final validation. Marketplace agents improve upstream quality (pre-processing) and reduce false positives (post-processing).

**Timeline:** Phase 2 (Month 1-2)

**Expected Impact:** 75% reduction in manual OCR review workload

---

### SELECTIVELY ADD (Phased Approach)
4. **Database Agents** → Add PostgreSQL DBA or Neon Optimizer NOW
5. **Data Scientist** → Add in 6 months when historical data exists
6. **ML Engineer** → Only add if simpler approaches fail (12+ months)

**Reasoning:** Optimize what you have first (database performance). Add advanced analytics when you have data to support it. Avoid ML complexity until proven necessary.

**Timeline:**
- Database optimization: Immediate
- Data Scientist: Month 6
- ML Engineer: Only if needed (Month 12+)

---

## UPDATED IMPLEMENTATION ROADMAP

### Phase 1: Core Systems (IMMEDIATE - Week 1-2)
**Must-Do Agents:**
1. Business Analyst - Executive dashboard
2. Legal Advisor - Cross-agent collaboration
3. Marketing Attribution Analyst - Track what's working
4. PostgreSQL DBA - Database optimization

**Research System Replacement:**
5. Deep Research Team - Replace GT Research and Restaurant Research agents

**Expected Impact:** Daily CEO dashboard, legal oversight, database performance gains

---

### Phase 2: Content & Support (Month 1)
**Likely Implement Agents:**
6. Content Marketer - Autonomous content generation
7. Customer Support - Support ticket handling
8. Product Strategist - Innovation funnel management
9. Task Decomposition Expert - Break ideas into testable hypotheses

**Expected Impact:** Marketing and support running autonomously with your approval

---

### Phase 3: OCR Pipeline Enhancement (Month 2)
**OCR Agents:**
10. OCR Preprocessing Optimizer
11. OCR Grammar Fixer
12. OCR Quality Assurance

**Expected Impact:** 75% reduction in AirTip manual receipt review

---

### Phase 4: Sales & Optimization (Month 2-3)
**Additional Agents:**
13. Sales Automator - Restaurant/school outreach
14. Risk Manager - Financial exposure assessment
15. Prompt Engineer - Improve agent quality
16. Model Evaluator - Cost optimization

**Expected Impact:** Sales pipeline automation, smarter risk management

---

### Phase 5: Advanced Analytics (Month 6+)
**Data Science Agents (ONLY when you have data):**
17. Data Scientist - Predictive forecasting, advanced segmentation
18. ML Engineer - ONLY if simpler approaches fail

**Expected Impact:** Better inventory forecasting, reduced waste, optimized pricing

---

## ALIGNMENT WITH YOUR REFINED PHILOSOPHY

### "Best-in-Class Individual Contributors with Contractors"

**Deep Research Team perfectly embodies this:**
- Research Coordinator = Senior researcher (makes decisions)
- Competitive Intelligence Analyst, Academic Researcher, etc. = Expert contractors (execute tasks)
- Research Synthesizer = Editor (combines outputs)

No one agent tries to do everything. Each has a clear specialty.

### "Marketing Evaluates When to Escalate to Legal"

**How to configure Legal Advisor:**
```markdown
Legal Advisor reviews marketing materials when:
- New campaign type (never done before)
- Claims about product efficacy, safety, or compliance
- User-generated content features
- Pricing changes that could be seen as discriminatory
- International markets (different regulations)

Does NOT review:
- Minor copy changes to existing campaigns
- Social media posts that follow existing templates
- Email subject line A/B tests
- Internal-only materials
```

Marketing Agent has criteria, makes judgment call, escalates when appropriate. Legal doesn't see everything.

### "No Specific Innovation Funnel Quota"

**How to configure Product Strategist:**
```markdown
Product Strategist generates as many ideas as pass quality bar.

Quality bar:
- Aligns with venture mission
- Addresses real user problem (validated)
- Feasible within resource constraints
- Has clear success metrics

If 20 ideas pass this month, surface all 20.
If 2 ideas pass next month, surface 2.

Don't force ideas to hit quota.
```

Task Decomposition Expert then breaks down ALL passing ideas. Risk Manager filters for financial feasibility. You see finalists.

### "Keep It Under $1,000 Total Spend"

**Current Subscriptions (Your Note):**
- ChatGPT: ~$20/month
- Gemini: ~$20/month
- Claude Max (you): $100/month
- Veo: ~$20/month
- Other odds and ends: ~$40/month
- **Total: ~$200/month baseline**

**Agent Add-On Cost (Phase 1-4):**
- All agents run within your Claude Max subscription (no additional API costs yet)
- **Additional cost: $0/month**

**Future API Cost (Phase 5, Month 6+):**
- When you move to scheduled agents (Haiku for operational tasks)
- Budget cap: $50/month (your plan)
- **Total projected: $250/month**

**Well under your $1,000 limit.**

### "Agents Work Most Efficient Way"

**Research Example:**
- Deep Research Team Coordinator can handle research for ALL ventures
  - GT-IMS: CPG/frozen food intelligence
  - Menu Autopilot: Restaurant industry trends
  - SidelineIQ: Youth sports market research

Same coordinator, different domain specialists, different outputs.

**Analytics Counter-Example:**
- Business Analyst probably needs to be VENTURE-SPECIFIC
  - GT-IMS Analyst: Inventory metrics, supplier performance
  - Menu Autopilot Analyst: Restaurant engagement, subscription churn
  - AirTip Analyst: Tip processing volume, error rates

Too different to combine into one agent without complexity explosion.

**Guideline:**
- If agent role is domain-agnostic (research, legal, content), share across ventures
- If agent role is domain-specific (analytics, product strategy), separate per venture
- Tipping point: When single agent prompt exceeds 1000 lines, split it

---

## OPEN DESIGN QUESTIONS

### 1. Deep Research Team Configuration
**Question:** Should you have ONE Research Coordinator for all ventures, or one per venture?

**Option A: Single Shared Coordinator**
- Pros: Can share insights across ventures, learns patterns faster
- Cons: Risk of context confusion (GT vs Menu Autopilot research)

**Option B: One Coordinator Per Venture**
- Pros: Clear context boundaries, specialized knowledge
- Cons: Duplicate infrastructure, can't share insights

**Recommendation:** Start with Option A (shared), split only if context confusion becomes problem.

---

### 2. OCR Pipeline Placement
**Question:** Should OCR pipeline run on every receipt, or only flagged receipts?

**Option A: Run on All Receipts**
- Preprocessing → OCR → Grammar Fixer → QA → Validation
- Pros: Highest quality, fewest false positives
- Cons: More processing time/cost per receipt

**Option B: Run Only on Flagged Receipts**
- OCR → Validation → IF FLAGGED → Grammar Fixer → QA
- Pros: Lower cost, faster processing
- Cons: Misses opportunity to improve high-confidence scans

**Recommendation:** Option A. Pre-processing is cheap, reduces downstream errors.

---

### 3. Data Scientist Scope
**Question:** When you add Data Scientist (Month 6), should it be shared or venture-specific?

**Option A: Shared Data Scientist**
- Handles analytics across GT-IMS, Menu Autopilot, AirTip
- Pros: Can identify cross-venture patterns
- Cons: Needs to understand 3+ different data schemas

**Option B: Venture-Specific Data Scientists**
- GT Data Scientist, Menu Data Scientist, AirTip Data Scientist
- Pros: Deep domain expertise, simpler prompts
- Cons: More expensive, can't share learnings

**Recommendation:** Option A initially. If agent prompt exceeds 1000 lines, split.

---

## NEXT STEPS

1. **Review this overlap analysis**
2. **Decide on open design questions** (shared vs separate coordinators, OCR pipeline placement, etc.)
3. **Approve Phase 1 implementation** (Business Analyst, Legal Advisor, Marketing Attribution, PostgreSQL DBA, Deep Research Team)
4. **Install Phase 1 agents** (Week 1)
5. **Configure agent communication flows** (Week 2)
6. **Test with real workflows** (Week 2-3)
7. **Evaluate and iterate** (Week 4)

---

**End of Overlap Analysis**
