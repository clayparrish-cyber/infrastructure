# Ralph Task Queue

All designs complete. Ready to deploy Ralph on any of these.

## Status Legend
- **RALPH READY** - Has mission doc with clear success criteria
- **COMPLETED** - Ralph finished this mission

---

## Priority 2: Executive Dashboard Build

**Status:** RALPH READY

**Mission Doc:** `RALPH-EXECUTIVE-DASHBOARD.md`
**Design Doc:** `docs/plans/2026-01-23-executive-dashboard-design.md`
**Promise:** `<promise>EXECUTIVE DASHBOARD DEPLOYED</promise>`

**Design Decisions:**
- Location: `infrastructure/apps/executive-dashboard/`
- Database: Shared GT-IMS Neon instance
- Auth: Google OAuth @gallanttiger.com
- Scope: Full L10 meeting interface

**To Deploy:**
```bash
/ralph-loop --completion-promise "EXECUTIVE DASHBOARD DEPLOYED" --max-iterations 20
```

---

## Priority 3: Agent Prime Directives

**Status:** ✅ COMPLETED (2026-01-23)

**Mission Doc:** `RALPH-PRIME-DIRECTIVES.md`
**Design Doc:** `docs/plans/2026-01-23-agent-prime-directives-design.md`
**Promise:** `<promise>PRIME DIRECTIVES ENFORCED</promise>`

**Design Decisions:**
- Enforcement: Flag for human review (soft)
- Storage: Centralized config file
- Scope: Universal + agent-specific rules

**Results:**
- `packages/agent-learning/src/directives/` - Types and checker functions
- `config/agents/prime-directives.ts` - Centralized directive config
- AgentRecommendation schema updated with needsVerification, violationReason, confidence, dataSources
- inventory-health.ts using directive checking
- All 10 tests pass

---

## Priority 4: Dynamic Demand Forecasting

**Status:** RALPH READY

**Mission Doc:** `RALPH-DYNAMIC-DEMAND.md`
**Design Doc:** `docs/plans/2026-01-23-dynamic-demand-design.md`
**Promise:** `<promise>DYNAMIC DEMAND IMPLEMENTED</promise>`

**Design Decisions:**
- Pre-launch: CRM LIVE opportunity velocity
- Post-launch: Distributor sales data (SalesData table)
- Fallback: Hardcoded 10 with needsVerification flag

**To Deploy:**
```bash
/ralph-loop --completion-promise "DYNAMIC DEMAND IMPLEMENTED" --max-iterations 15
```

---

## Priority 5: Additional Agent Scripts

**Status:** RALPH READY (with constraints)

These use standard patterns from inventory-health.ts:

| Agent | Mission | Promise |
|-------|---------|---------|
| legal-review.ts | Scan docs for legal concerns | `LEGAL AGENT VERIFIED` |
| research-request.ts | Coordinate deep research | `RESEARCH AGENT VERIFIED` |
| db-optimization.ts | Suggest query optimizations | `DBA AGENT VERIFIED` |

---

## Priority 6: Security Hardening (Codex Audit - 2026-01-24)

**Status:** BACKLOG (needs design)

**Source:** Codex security audit of Agent Dashboard and infrastructure

### Critical Issues

| Issue | Risk | Fix |
|-------|------|-----|
| **XSS via innerHTML** | Agent output containing HTML/JS executes in browser | Sanitize content before innerHTML or use textContent |
| **Approval forgery** | JSON editable, CLI has no auth, ID suffix matching weak | Signed tokens, full ID validation, per-user identity |
| **No agent isolation** | All data co-mingled in shared JSON/tables | Context boundaries between agent types |

### Important Issues

| Issue | Risk | Fix |
|-------|------|-----|
| **No retry/escalation** | FAILED tasks just sit with status marker | Retry queue, alert generation on failures |
| **No rate limiting** | Agents can burn API budget unchecked | Runtime rate limiting, budget enforcement |
| **No observability** | Only dashboard view, no logs/traces/metrics | Structured logging, event tracing |
| **UI state drift** | localStorage can drift from JSON canonical state | Single source of truth, no localStorage for decisions |

### Recommendations from Audit

1. **Sanitize agent-rendered content** - innerHTML → sanitized HTML or text nodes
2. **Harden approvals** - signed tokens, full ID validation, audit trail
3. **Implement retry/escalation** - retry queue, alerts on repeated failures
4. **Add rate limiting** - per-agent, per-hour limits with budget caps
5. **Improve observability** - structured logs, metrics, event tracing

### Notes

- Local dashboard (`tools/agent-dashboard/`) is for solo projects (SidelineIQ/Dosie)
- GT-IMS uses database-backed Command Center (different security model)
- Executive Dashboard (Priority 2) should incorporate these fixes from the start

---

## Completed Ralph Missions

### Prime Directives (2026-01-23)
- Mission: Implement agent guardrails
- Status: ✅ COMPLETED
- Doc: `RALPH-PRIME-DIRECTIVES.md`
- Duration: ~10 minutes
- Result: Directive types, checker function, schema fields, inventory agent updated

### Learning Loop (2026-01-23)
- Mission: Close the agent learning loop
- Status: ✅ COMPLETED
- Doc: `RALPH-LEARNING-LOOP.md`
- Duration: ~15 minutes
- Result: Signal scoring, deduplication, few-shot learning all working

---

## Recommended Deployment Order

1. ~~**Prime Directives** (Priority 3)~~ - ✅ DONE

2. **Dynamic Demand** (Priority 4) - ~15 min
   - Fixes hardcoded demand issue
   - Will use Prime Directives (now complete)

3. **Executive Dashboard** (Priority 2) - ~30-45 min
   - Largest scope, but well-defined
   - Benefits from agents having directives
   - **Should incorporate Priority 6 security fixes** (sanitization, approval hardening)

---

## How to Deploy Ralph

1. Read the mission doc first to understand scope
2. Run Ralph:
   ```bash
   /ralph-loop --completion-promise "[PROMISE TEXT]" --max-iterations N
   ```
3. Monitor:
   ```bash
   head -10 .claude/ralph-loop.local.md
   ```
4. After completion, update this document with results
