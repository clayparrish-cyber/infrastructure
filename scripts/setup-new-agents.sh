#!/bin/bash
# One-time script to insert new Chief of Staff agents into Supabase
# Run with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars set
# Or run within GitHub Actions where secrets are available

set -euo pipefail

if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set"
  exit 1
fi

echo "Inserting new agents into Supabase..."

# Use upsert (Prefer: resolution=merge-duplicates) to be idempotent
for AGENT_JSON in \
  '{"id":"credential-expiry-check","name":"Credential Expiry Check","tier":1,"status":"active","budget_monthly":1.00}' \
  '{"id":"post-nightly-health-check","name":"Post-Nightly Health Check","tier":1,"status":"active","budget_monthly":2.00}' \
  '{"id":"chief-of-staff-daily-brief","name":"Chief of Staff Daily Brief","tier":1,"status":"active","budget_monthly":5.00}'
do
  AGENT_ID=$(echo "$AGENT_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")

  HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' \
    -X POST "$SUPABASE_URL/rest/v1/agents" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: resolution=merge-duplicates,return=minimal" \
    -d "$AGENT_JSON")

  if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
    echo "  OK: $AGENT_ID (HTTP $HTTP_CODE)"
  else
    echo "  WARNING: $AGENT_ID returned HTTP $HTTP_CODE"
  fi
done

echo "Done. Verify with:"
echo "  curl \"\$SUPABASE_URL/rest/v1/agents?id=in.(credential-expiry-check,post-nightly-health-check,chief-of-staff-daily-brief)&select=id,name,status\" -H \"apikey: \$SUPABASE_SERVICE_ROLE_KEY\" -H \"Authorization: Bearer \$SUPABASE_SERVICE_ROLE_KEY\""
