#!/usr/bin/env bash
# Meta Ads API Heartbeat
# Accumulates successful Marketing API calls to meet Meta's 1,500-call / 15-day
# threshold for Ads Management Standard Access approval.
#
# Requires:
#   META_ADS_ACCESS_TOKEN  — Long-lived token generated from SidelineIQ Facebook App (874168382262397)
#   META_ADS_ACCOUNT_ID    — Ad account ID (without "act_" prefix)

set -euo pipefail

GRAPH_API_VERSION="v21.0"
BASE="https://graph.facebook.com/${GRAPH_API_VERSION}"

if [[ -z "${META_ADS_ACCESS_TOKEN:-}" || -z "${META_ADS_ACCOUNT_ID:-}" ]]; then
  echo "ERROR: META_ADS_ACCESS_TOKEN and META_ADS_ACCOUNT_ID must be set"
  exit 1
fi

TOKEN="${META_ADS_ACCESS_TOKEN}"
ACCOUNT="act_${META_ADS_ACCOUNT_ID}"

SUCCESS=0
FAIL=0

call_endpoint() {
  local name="$1"
  local url="$2"

  HTTP_CODE=$(curl -s -o /tmp/meta_response.json -w "%{http_code}" "$url")

  if [[ "$HTTP_CODE" =~ ^2 ]]; then
    SUCCESS=$((SUCCESS + 1))
    echo "  ✓ ${name} (${HTTP_CODE})"
  else
    FAIL=$((FAIL + 1))
    ERROR_MSG=$(cat /tmp/meta_response.json 2>/dev/null | head -c 200)
    echo "  ✗ ${name} (${HTTP_CODE}): ${ERROR_MSG}"
  fi
}

echo "=== Meta Ads API Heartbeat — $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
echo ""

# 1. Ad account info
call_endpoint "ad_account_info" \
  "${BASE}/${ACCOUNT}?fields=id,name,account_status,currency,timezone_name&access_token=${TOKEN}"

# 2. List campaigns
call_endpoint "list_campaigns" \
  "${BASE}/${ACCOUNT}/campaigns?fields=id,name,status,objective&limit=25&access_token=${TOKEN}"

# 3. List ad sets
call_endpoint "list_adsets" \
  "${BASE}/${ACCOUNT}/adsets?fields=id,name,status,daily_budget&limit=25&access_token=${TOKEN}"

# 4. List ads
call_endpoint "list_ads" \
  "${BASE}/${ACCOUNT}/ads?fields=id,name,status,creative&limit=25&access_token=${TOKEN}"

# 5. Campaign insights (last 7 days)
call_endpoint "campaign_insights" \
  "${BASE}/${ACCOUNT}/insights?fields=impressions,clicks,spend,reach&date_preset=last_7d&access_token=${TOKEN}"

echo ""
echo "Results: ${SUCCESS} success, ${FAIL} failed"
TOTAL=$((SUCCESS + FAIL))
if [[ $TOTAL -gt 0 ]]; then
  ERROR_RATE=$(( (FAIL * 100) / TOTAL ))
  echo "Error rate: ${ERROR_RATE}%"
fi

# Exit with failure if error rate > 10%
if [[ $FAIL -gt 0 && $TOTAL -gt 0 ]]; then
  ERROR_RATE=$(( (FAIL * 100) / TOTAL ))
  if [[ $ERROR_RATE -gt 10 ]]; then
    echo "WARNING: Error rate ${ERROR_RATE}% exceeds 10% threshold"
    exit 1
  fi
fi

echo ""
echo "HEARTBEAT_COMPLETE"
