#!/bin/bash
# Sourced by the existing work loop. Outputs one validated argument per line.
# No command evaluation, provider launch, CC mutation or permission selection.
MODEL_ROUTER_CLI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/cli.mjs"

model_route_work_item() {
  local item_json="$1" budget_cap="$2" budget_spent="$3"
  local remaining
  remaining=$(python3 - "$budget_cap" "$budget_spent" <<'PY'
import decimal
import re
import sys

values = sys.argv[1:]
if any(not re.fullmatch(r'(?:0|[1-9][0-9]*)(?:\.[0-9]+)?', value) for value in values):
    sys.exit('Model routing failed: invalid API budget cap or spend')
cap, spent = map(decimal.Decimal, values)
if cap <= 0 or spent < 0 or spent >= cap:
    sys.exit('Model routing failed: API budget exhausted')
print(format(cap - spent, 'f'))
PY
  ) || return 1
  node "$MODEL_ROUTER_CLI" \
    --runtime claude-cli --profile legacy-worker --domain general --mode production \
    --budget-state available --budget-kind api-usd --remaining-usd "$remaining" \
    --work-item --format argv-lines <<< "$item_json"
}
