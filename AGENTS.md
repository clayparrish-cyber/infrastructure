# Infrastructure agent instructions

Read [CLAUDE.md](CLAUDE.md) for project context. Shared model selection lives in
[model-routing.md](docs/knowledge/canonical/model-routing.md); read it before
changing task model defaults, qualifications or adapters.

The two nightly review workflows are manual-only. Model routing does not grant
permission to reactivate schedules or change tool/approval boundaries.

## Recent Changes

- **2026-09-10** — Added shared runtime-aware model candidates, scoped qualification gates and a tested CLI. Explicit per-run model choices override stored task preferences; worker selection runs before claiming a task.
