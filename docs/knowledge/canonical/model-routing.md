---
type: canonical
owner: Clay Parrish
created_at: 2026-09-10
review_by: 2026-10-10
expires_at: none
source_of_truth: agents/model-policy.json
status: active
---

# Model selection

Spend reasoning effort where it changes the answer. Use exact code or formulas
for repeatable calculations. Use models to interpret evidence, handle ambiguity
and check conclusions. Cheaper models earn wider use by passing the same work
tests. A model name is not evidence that it can do GT's work.

The shared policy is [`agents/model-policy.json`](../../../agents/model-policy.json).
The resolver returns a reason, model, effort, domain and qualification status.
It never calls a provider, changes account settings or chooses permissions.
Run `npm run test:model-routing` to check it without spending model tokens.

## Candidate choices

| Task profile | Claude CLI candidate | Codex CLI candidate | Why |
|---|---|---|---|
| `deterministic` | No model | No model | Queries, calculations and repeatable checks should produce exact results. |
| `routine` | Sonnet 5, high | Luna, medium | Bounded work with supplied sources and objective acceptance checks. |
| `source-analysis` | Sonnet 5, high | Terra, medium | Combine evidence, preserve citations and surface conflicts. |
| `hard-code` | Opus 5, medium | Sol, high | Difficult debugging and changes across modules need stronger reasoning. |
| `ambiguous-strategy` | Opus 5, high | Astra, high | Competing goals and uncertain assumptions need careful judgment. |
| `adversarial-review` | Opus 5, high | Astra, high | Challenge a consequential conclusion with an independent reviewer. |

These are starting candidates, not measured performance rankings. No new route
in this table is approved for automatic production work yet. No profile defaults
to max or ultra. A user can explicitly request a supported higher effort.
The policy does not alter Clay's active session or lower anyone's weekly token
allowance. Subscription capacity and API spending are separate budget inputs.

## Use the resolver

Get a recommendation without dispatch arguments:

```bash
node scripts/model-routing/cli.mjs --profile source-analysis --runtime codex-cli --domain finance
```

Preserve the model and effort the user already selected:

```bash
node scripts/model-routing/cli.mjs --profile routine --runtime codex-cli \
  --current-model gpt-6-astra --current-effort ultra
```

An explicit `--model` or `--effort` overrides that selection for this task. If an
explicit model change omits effort, the new model's supported default is used;
the resolver does not carry an incompatible effort onto it. Unknown models,
profiles, runtimes and effort levels fail. There is no cross-provider fallback.

For a funded evaluation, emit safe argument elements:

```bash
node scripts/model-routing/cli.mjs --profile routine --runtime codex-cli \
  --mode evaluation --budget-state available --budget-kind evaluation
```

This prints JSON including `argv`. The caller may append those elements to
`codex exec` or `claude -p`, keeping its own tool, sandbox, timeout and approval
flags. `--format argv-lines` prints one validated argument per line. Read them
into a quoted array; never use `eval` or interpolate them into shell source.
The resolver itself does not run the evaluation or infer that it is funded.

`--mode production` requires both an available budget and a matching qualification
record. `recommend` is the default and never emits dispatch arguments. Missing,
unknown or exhausted budget state blocks evaluation/production. For `api-usd`,
`--remaining-usd` is required and must be positive. An evaluation-only budget
cannot authorize production. A subscription budget uses an explicit state
from the caller; API dollars cannot estimate its remaining allowance. This is a
preflight check, not a provider billing cap or reservation across concurrent runs.

## Existing baseline

`legacy-worker` is the one continuity exception. It selects
`claude-sonnet-5` with `high` effort in the existing work loop, in the `general`
domain. Its status is **legacy**, not **qualified**. This makes Clay's approved
Sonnet/high delegation choice explicit; it is not a claim that prior worker
runs used that exact model. Before this change those two worker calls omitted
model and effort, and their effective defaults were not measured in this task.

The selection is based on Clay's July 7 delegation instruction (Sonnet/high for
ordinary delegated work; Opus/medium for difficult code) and the September 10
authorization to implement routing. Existing workflow review calls also specify
Sonnet 5/high. These establish an operating choice, not a financial accuracy test.
The `legacy` exception cannot qualify another profile or a business domain.

`agents/workers/work-loop-manager.sh` calls the policy before marking either a
worker or a specialist item `in_progress`. It passes the existing remaining
nightly API budget and reads validated argument lines into a Bash array. Its
existing permissions, tools, timeouts, turn limits and stdin behavior stay in
the caller. Invalid routes skip dispatch and leave the item unclaimed.

Task preferences may be stored under CC `metadata.model_routing`:

```json
{
  "profile": "source-analysis",
  "domain": "finance",
  "currentSelection": { "model": "claude-sonnet-5", "effort": "high" },
  "override": { "model": "claude-opus-5", "effort": "medium" }
}
```

The example will fail production until this exact route has finance evidence.
With `--work-item`, these fields override the caller's preference defaults.
CC metadata cannot set runtime, mode, budget or permissions. Existing untagged
items retain the `legacy-worker/general` continuity scope; this does not infer
their business domain. A new domain workflow must declare its domain and pass
qualification before promotion.

## Qualify separately for real work

Add a `qualified` record only after evaluating the exact model, effort, runtime,
profile and domain. Every record requires:

- `reviewedBy`, an `approvedAt` UTC timestamp and an `expiresAt` date.
- `evidence`, a GitHub file URL pinned to a 40-character commit.
- `modelRevision`, the observed provider model revision from the evaluated runs.
- `testSuite` with its `id`, commit/content-digest `version`, matching runtime,
  model, effort, model revision, profile and domain; a commit-pinned `report`,
  positive `cases` count and `result: "pass"`.

Production requests must match the record's model revision, suite ID and suite
version through `qualificationContext` (or CLI `--model-revision`, `--suite-id`,
`--suite-version`). A finance pass does not approve logistics or specifications.
Changed model/suite versions, future approvals and expired records block production.
No models are silently substituted when a route loses qualification.

The validator checks the evidence contract; it does not authenticate the named
reviewer or rerun/read the linked report. Reviewing the actual pinned test results
and approval is required when merging a qualification change. There are no seeded
`qualified` records in this release.

For each domain, save reviewed cases, source versions, expected answers, actual
model IDs, errors, latency and usage. Include withheld cases and failures, not
only successful examples. Compare with the same accepted baseline and have the
domain owner approve the evidence and error tolerances before updating policy.

- **Finance:** reconcile to Adam's accepted data, periods, formulas and totals;
  include conflicting sources, missing data and unsupported assumptions.
- **Logistics:** test units, lead times, stock, allocations, dates and constraints
  against reviewed operations cases.
- **Specifications:** test SKU/version identity, units, ingredients and source
  authority. Reject invented or stale facts.

Review qualification and budget results after onboarding in one month. Adjust
routes from observed quality, rework and capacity, not model marketing. The model
policy does not authorize purchases, deployments, messages or other consequential
actions; their existing human approval rules still apply.

## Runtime evidence and integration limits

Verified on September 10, 2026 without paid inference calls:

- Claude Code **2.1.267** accepts model IDs and effort flags. The current
  [Claude model configuration](https://code.claude.com/docs/en/model-config)
  supports low/medium/high/xhigh/max for the registered Sonnet 5 and Opus 5.
- Codex **0.153.4**, catalog fetched **2026-09-10T16:12:18.969281Z**, lists exact
  IDs `gpt-6-astra`, `gpt-5.6-sol`, `gpt-5.6-terra` and `gpt-5.6-luna`.
  Astra/Sol/Terra support low through ultra; Luna supports low through max and
  **does not support ultra**. CLI catalog defaults are low/low/medium/medium.
  The adapter emits `-m ID -c 'model_reasoning_effort="LEVEL"'` for `codex exec`.

This catalog deliberately describes CLI support, not API support. Provider API
efforts, context limits and tool protocols can differ. Claude may clamp effort
or substitute a model at startup, so qualification receipts must verify actual
`modelUsage` and effective settings, not just requested CLI arguments.

Both infrastructure nightly workflows remain **manual-only**. This change does
not reactivate them. The managed-agent pipeline and other hardcoded review calls
are not migrated. GT's scheduled Anthropic API jobs and eval harness need provider
adapters and domain evaluation before using OpenAI text models. Its existing
OpenAI embedding integration does not supply those adapters. ChatGPT, Codex and
Claude app model pickers are not remotely controlled by this policy.

Fable is not an automatic candidate here: print/SDK usage can charge usage credits
without another prompt. Any later registration needs a separately understood
billing route and task evidence. No subscriptions or account limits were changed.
