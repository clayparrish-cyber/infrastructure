---
type: operational
owner: clay
created_at: 2026-02-24
review_by: 2026-03-24
expires_at: 2026-05-24
source_of_truth: https://console.anthropic.com/settings/billing
status: active
---

# Anthropic API Billing & Credit Management

## Auto-Reload Setup (MANUAL — Clay must do this)

Anthropic Console has a built-in auto-reload feature. Steps:

1. Go to https://console.anthropic.com/settings/billing
2. Find the **Auto-Reload** section
3. Click **Edit** (or **Edit Settings**)
4. Toggle auto-reload to **On**
5. Set **minimum balance** (suggested: $25 — enough for ~2 nightly runs)
6. Set **reload amount** (suggested: $100 — covers ~1 week of nightly agents)
7. Save

### Recommended Settings

| Setting | Value | Rationale |
|---------|-------|-----------|
| Auto-reload | On | Prevents credit exhaustion stopping nightly agents |
| Minimum balance | $25 | ~2 nightly runs cost $5-15 each |
| Reload amount | $100 | Covers ~1 week of nightly agent pipeline |

### Important Notes

- Credits expire **1 year** from purchase date (non-extendable)
- Auto-reload charges the card on file when balance drops below minimum
- There is no API to configure auto-reload — it must be done in the Console UI

## Credit Health Check (AUTOMATED)

The nightly pipeline (`nightly-review.yml`) now includes a `credit-check` job that:

1. **Admin API cost report** (if `ANTHROPIC_ADMIN_API_KEY` secret is set): Reports 7-day spend via `/v1/organizations/cost_report`
2. **Lightweight API probe**: Sends a zero-cost `count_tokens` request to detect 402 (exhausted), 401 (bad key), or 429 (rate limited)
3. **Pipeline gating**: If credits are exhausted (402) or key is invalid (401), all downstream jobs are skipped
4. **Command Center alert**: Creates a high-priority work item in the dashboard when credits are low/exhausted

### Admin API Key (Optional Enhancement)

To get detailed cost reports, generate an Admin API key:

1. Go to https://console.anthropic.com/settings/admin-keys (must be org admin)
2. Create a new admin key (starts with `sk-ant-admin...`)
3. Add it as a GitHub secret: `ANTHROPIC_ADMIN_API_KEY`
4. The credit-check job will automatically use it for 7-day cost reporting

Note: The Admin API key is **optional**. The lightweight probe works with just the regular `ANTHROPIC_API_KEY`.

## Cost Reference

Typical nightly pipeline costs (as of Feb 2026):
- Per agent-project review: $2-8 (depends on codebase size and max turns)
- Full Tier 1 run (6 projects x 1 theme): $15-40
- Sunday full run (all projects): $30-60
- Monthly estimated: $400-800
