# Plan: Agent Cost Telemetry

## Goal
Track token usage and costs for every agent run, stored in `agent_runs_v2`.

## Key Insight
`claude -p --output-format json` already returns `total_cost_usd`, full token breakdown, and `modelUsage` per-model. We just need to capture it.

## Changes

### Step 1: Add columns to `agent_runs_v2` (Supabase migration)
```sql
ALTER TABLE agent_runs_v2
  ADD COLUMN IF NOT EXISTS tokens_input integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tokens_output integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cache_creation_tokens integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cache_read_tokens integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_usd decimal(10,6) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS model varchar(100),
  ADD COLUMN IF NOT EXISTS duration_ms integer;
```

### Step 2: Update workflow to capture JSON output
**File:** `.github/workflows/nightly-review.yml`

Currently the workflow runs `claude -p` and pipes through `tee`. Change to:
1. Use `--output-format json`
2. Save JSON output to a file
3. Extract the text result for the report (from `.result` field)
4. Extract cost/usage from the JSON for database insert

Pattern:
```bash
# Run claude and capture JSON output
claude -p "$PROMPT" --max-turns "$MAX_TURNS" --output-format json \
  --allowedTools "Read,Write,Edit,Glob,Grep,Bash" > "$OUTPUT_JSON" 2>"$LOG_FILE"

# Extract result text for report processing
RESULT=$(python3 -c "import json; print(json.load(open('$OUTPUT_JSON')).get('result',''))")

# Extract usage for database
COST_USD=$(python3 -c "import json; print(json.load(open('$OUTPUT_JSON')).get('total_cost_usd', 0))")
INPUT_TOKENS=$(python3 -c "import json; print(json.load(open('$OUTPUT_JSON')).get('usage',{}).get('input_tokens', 0))")
OUTPUT_TOKENS=$(python3 -c "import json; print(json.load(open('$OUTPUT_JSON')).get('usage',{}).get('output_tokens', 0))")
CACHE_CREATE=$(python3 -c "import json; print(json.load(open('$OUTPUT_JSON')).get('usage',{}).get('cache_creation_input_tokens', 0))")
CACHE_READ=$(python3 -c "import json; print(json.load(open('$OUTPUT_JSON')).get('usage',{}).get('cache_read_input_tokens', 0))")
DURATION=$(python3 -c "import json; print(json.load(open('$OUTPUT_JSON')).get('duration_ms', 0))")
MODEL=$(python3 -c "import json; m=json.load(open('$OUTPUT_JSON')).get('modelUsage',{}); print(list(m.keys())[0] if m else 'unknown')")
```

### Step 3: Update sync-to-supabase.ts to accept usage data
**File:** `agents/lib/sync-to-supabase.ts`

Add optional parameters for token/cost fields when inserting into `agent_runs_v2`:
```typescript
interface RunUsage {
  tokens_input: number;
  tokens_output: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  cost_usd: number;
  model: string;
  duration_ms: number;
}
```

### Step 4: Update workflow steps that write to agent_runs_v2
Every place in the workflow that inserts into `agent_runs_v2` via curl needs the new fields added. Search for `agent_runs_v2` in the workflow YAML and add the usage fields to each insert.

### Step 5: Verify agent_budget_summary view
Check if the `agent_budget_summary` Supabase view already references `cost_usd`. If not, update it to aggregate from the new column.

## Files to Modify
1. Supabase SQL Editor — migration for new columns
2. `.github/workflows/nightly-review.yml` — output format + usage extraction
3. `agents/lib/sync-to-supabase.ts` — accept and store usage data
4. Supabase SQL Editor — update `agent_budget_summary` view if needed

## Testing
1. Trigger a manual workflow dispatch for one project/theme
2. Verify `agent_runs_v2` row has populated cost/token fields
3. Check `agent_budget_summary` view returns correct aggregation

## Risk
- `--output-format json` wraps the entire output in JSON — the text result is in `.result`. Report processing that expects raw text needs to read from `.result` instead of raw stdout.
- If `claude -p` fails, the JSON output may be an error object — need to handle `is_error: true` case.
