/**
 * Phase 1 Agent Configuration
 *
 * Defines behavior for:
 * - Business Analyst (Monday briefing)
 * - Legal Advisor (escalation criteria)
 * - Marketing Attribution Analyst (channel tracking)
 * - Deep Research Team (research domains)
 * - PostgreSQL DBA (performance thresholds)
 */

export const phase1AgentConfig = {
  /**
   * Business Analyst Configuration
   * Generates cross-venture Monday morning executive briefing
   */
  businessAnalyst: {
    // All ventures to include in briefing
    ventures: ['gt-ims', 'menu-autopilot', 'airtip', 'sidelineiq', 'dosie'],

    // When to run (manual trigger for Phase 1)
    briefingSchedule: 'manual', // Will be 'Sunday 10pm' in Phase 5 (automated)

    // Key metrics per venture
    keyMetrics: {
      'gt-ims': [
        'revenue',
        'inventory_turnover',
        'stockout_rate',
        'supplier_performance',
        'days_of_supply'
      ],
      'menu-autopilot': [
        'mrr',
        'restaurant_churn',
        'menu_updates_per_week',
        'engagement_rate',
        'avg_revenue_per_restaurant'
      ],
      'airtip': [
        'tip_processing_volume',
        'ocr_error_rate',
        'payroll_accuracy',
        'restaurant_count',
        'avg_tips_per_restaurant'
      ],
      'sidelineiq': [
        'student_count',
        'lesson_completion_rate',
        'subscription_revenue',
        'referral_rate',
        'monthly_active_users'
      ],
      'dosie': [
        'feature_usage',
        'bug_reports',
        'user_satisfaction',
        'time_saved_per_user'
      ]
    },

    // Alert thresholds (when to flag anomalies)
    thresholds: {
      revenue_drop_pct: 10,    // Alert if revenue drops >10% WoW
      error_spike_pct: 20,     // Alert if errors spike >20%
      churn_spike_pct: 15,     // Alert if churn increases >15%
    },

    // Output format
    outputFormat: {
      portfolioOverview: true,  // Show aggregated metrics first
      top3Priorities: true,      // Surface top 3 action items
      ventureDetails: true,      // Include per-venture drill-downs
      maxLength: 500            // Max words for briefing
    }
  },

  /**
   * Legal Advisor Configuration
   * Rule-based escalation from Marketing Agent
   */
  legalAdvisor: {
    // Escalation criteria (Marketing checks these before escalating)
    escalationCriteria: {
      // Keyword triggers
      keywords: [
        'guaranteed',
        'proven',
        'scientifically validated',
        'clinically tested',
        '100%',
        'safe',
        'FDA approved',
        'best in class',
        'risk-free'
      ],

      // Campaign type checks
      newCampaignType: true,           // Escalate if campaign type not in historical DB
      internationalMarket: true,       // Escalate if targeting non-US markets
      userGeneratedContent: true,      // Escalate if featuring UGC
      pricingChanges: true,            // Escalate if changing pricing structure
      subscriptionTerms: true,         // Escalate if modifying subscription terms
    },

    // Exclusions (what NOT to send to Legal)
    excludeFromReview: [
      'minor_copy_changes',       // Small wording tweaks
      'email_subject_ab_tests',   // Email subject line tests
      'internal_materials',       // Internal-only content
      'social_media_templates'    // Standard social posts (unless new type)
    ],

    // Review SLA
    targetReviewTime: '24 hours',

    // Legal review output format
    outputFormat: {
      riskLevel: true,           // Low/Medium/High risk assessment
      recommendations: true,      // Specific changes to make
      precedents: true           // Reference to similar past reviews
    }
  },

  /**
   * Marketing Attribution Analyst Configuration
   * Tracks channel performance across ventures
   */
  marketingAttributionAnalyst: {
    // Ventures to track
    ventures: ['gt-ims', 'menu-autopilot', 'sidelineiq'], // AirTip and Dosie don't have active marketing yet

    // Attribution model
    attributionModel: 'last_touch', // Options: 'first_touch', 'last_touch', 'multi_touch'

    // Channels per venture
    channels: {
      'gt-ims': [
        'google_ads',
        'instagram',
        'facebook',
        'referral',
        'direct',
        'email'
      ],
      'menu-autopilot': [
        'google_ads',
        'partnerships',
        'referral',
        'direct',
        'linkedin',
        'cold_outreach'
      ],
      'sidelineiq': [
        'instagram',
        'tiktok',
        'referral',
        'school_partnerships',
        'word_of_mouth'
      ]
    },

    // Reporting frequency
    reportingFrequency: 'weekly',

    // Metrics to track
    metrics: [
      'cost_per_acquisition',
      'conversion_rate',
      'roi',
      'ltv_cac_ratio',
      'channel_revenue_contribution'
    ],

    // Alert thresholds
    thresholds: {
      cpa_increase_pct: 25,      // Alert if CPA increases >25%
      conversion_drop_pct: 20,   // Alert if conversion drops >20%
      roi_below: 1.5             // Alert if ROI falls below 1.5x
    }
  },

  /**
   * Deep Research Team Configuration
   * Single shared coordinator handles all ventures
   */
  deepResearchTeam: {
    // Shared across all ventures
    sharedAcrossVentures: true,

    // Research domains per venture
    researchDomains: {
      'gt-ims': [
        'cpg_frozen_food',
        'retail_distribution',
        'unfi',
        'grocery_trends',
        'frozen_food_consumer_behavior',
        'supplier_relationships'
      ],
      'menu-autopilot': [
        'qsr_industry',
        'restaurant_tech',
        'menu_optimization',
        'pos_systems',
        'restaurant_operations',
        'food_cost_management'
      ],
      'sidelineiq': [
        'youth_sports',
        'basketball_training',
        'edtech',
        'curriculum_design',
        'sports_performance',
        'parent_engagement'
      ],
      'airtip': [
        'tip_pooling_regulations',
        'payroll_compliance',
        'restaurant_labor',
        'wage_laws',
        'tip_reporting'
      ],
      'dosie': [
        'project_management',
        'personal_productivity',
        'task_management',
        'workflow_optimization'
      ]
    },

    // Quality standards
    qualityStandards: {
      minimumSources: 3,           // At least 3 sources per claim
      requireFactChecking: true,   // All claims must be fact-checked
      maxReportLength: 800,        // Max words for research report
      outputFormat: 'executive_summary', // Not raw data dumps
      confidenceThreshold: 0.7     // Only surface insights with >70% confidence
    },

    // Knowledge expiration (how long insights remain valid)
    knowledgeExpiration: {
      market_intelligence: '6 months',
      regulatory_research: '12 months',
      technology_trends: '3 months',
      competitive_analysis: '6 months'
    },

    // Research types
    researchTypes: [
      'competitive_intelligence',
      'market_trends',
      'regulatory_landscape',
      'technology_evaluation',
      'consumer_behavior',
      'industry_benchmarks'
    ]
  },

  /**
   * PostgreSQL DBA Configuration
   * Database query optimization across all ventures
   */
  postgresqlDBA: {
    // Databases to optimize
    databases: [
      {
        name: 'gt-ims',
        connectionString: process.env.GT_IMS_DATABASE_URL || '',
        priority: 'high' // GT has most complex queries
      },
      {
        name: 'menu-autopilot',
        connectionString: process.env.MENU_AUTOPILOT_DATABASE_URL || '',
        priority: 'high'
      },
      {
        name: 'airtip',
        connectionString: process.env.AIRTIP_DATABASE_URL || '',
        priority: 'medium'
      },
      {
        name: 'sidelineiq',
        connectionString: process.env.SIDELINEIQ_DATABASE_URL || '',
        priority: 'low' // Smaller scale currently
      }
    ],

    // Performance thresholds
    performanceThresholds: {
      slowQueryMs: 200,            // Flag queries slower than 200ms
      verySlowQueryMs: 1000,       // Urgent: queries slower than 1s
      connectionPoolSize: 20,      // Monitor if pool exceeds 20 connections
    },

    // Optimization schedule
    optimizationSchedule: 'weekly', // Run optimization checks weekly

    // What to optimize
    optimizationTargets: [
      'slow_queries',
      'missing_indexes',
      'table_bloat',
      'connection_pooling',
      'query_plan_analysis'
    ],

    // Output format
    outputFormat: {
      queryExplainPlan: true,      // Show query execution plans
      indexRecommendations: true,   // Suggest indexes to create
      estimatedImpact: true        // Show expected performance gain
    }
  },

  /**
   * Cross-Agent Communication Settings
   */
  communication: {
    // Polling frequency (how often agents check DB for new tasks)
    pollingIntervalMinutes: 5,

    // Database tables used
    tables: {
      tasks: 'agent_task',
      recommendations: 'agent_recommendation',
      alerts: 'agent_alert',
      knowledge: 'agent_knowledge'
    },

    // Timeout settings
    timeouts: {
      agentExecutionMaxMinutes: 10,   // Max time for agent to complete task
      legalReviewMaxHours: 24         // Max time for Legal to review
    }
  },

  /**
   * General Settings
   */
  general: {
    // Cost constraints
    monthlyBudgetLimit: 1000,        // Max $1,000/month total spend

    // Execution environment
    executionMode: 'local',          // 'local' (Claude Code) or 'api' (Anthropic API)

    // Logging
    logLevel: 'info',                // 'debug', 'info', 'warn', 'error'

    // User assignment
    defaultAssignee: 'clay',         // All recommendations assigned to Clay by default

    // Approval workflow
    requireApproval: true            // All recommendations require human approval
  }
}

export default phase1AgentConfig
