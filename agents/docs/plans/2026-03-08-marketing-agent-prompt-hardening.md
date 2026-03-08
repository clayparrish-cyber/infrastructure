# Marketing Agent Prompt Hardening

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Inject execution discipline into marketing agent prompts so they stop regressing to blank templates on repeat runs.

**Architecture:** Add a shared `marketing-execution-guardrails.md` include file with cross-cutting rules (iteration checks, scoreboard updates, calendar alignment), then update each marketing agent prompt to reference it and add agent-specific hardening. All changes are to prompt files in `/Volumes/Lexar/Projects/infrastructure/agents/`.

**Tech Stack:** Markdown prompt files, no code changes.

---

### Task 1: Create shared marketing execution guardrails include

**Files:**
- Create: `includes/marketing-execution-guardrails.md`

**Step 1: Write the guardrails file**

```markdown
# Marketing Execution Guardrails

These rules apply to ALL marketing agents. Violating them is a review failure.

## Iteration Discipline

1. **Diff from last run is MANDATORY.** Before writing any output, read the most recent prior report in `reports/` with your agent name. Your new output MUST differ substantively from it. If the previous run's metadata variants, keywords, or proposals are identical to what you would produce, you have failed — find something new or explicitly document why no changes are warranted with specific reasoning.

2. **Never submit blank templates.** Every field in every template must be filled. If you cannot fill a field (e.g., no App Store Connect data available), write `[DATA UNAVAILABLE: reason]` — never leave it blank.

3. **Stale output is worse than no output.** If you cannot produce meaningfully new work, write a 3-sentence summary explaining why and skip the run. Do not generate filler.

## Sports Calendar Alignment

1. **Check the current date and upcoming sports events.** Your output must reflect the current sports calendar:
   - Jan-Feb: Super Bowl, NFL playoffs
   - March: March Madness, Selection Sunday, conference tournaments
   - April: NBA/NHL playoffs, MLB opening day, NFL draft
   - May-June: NBA/NHL finals, French Open, MLB
   - July-Aug: MLB All-Star, Olympics (even years), NFL preseason
   - Sept: NFL season start, college football
   - Oct-Nov: World Series, NBA/NHL season start, college basketball start
   - Dec: Bowl season, holiday sports

2. **Cross-agent alignment.** If you are an ASO agent and the social content agent is pushing basketball content for March Madness, your keywords MUST include basketball terms. Read `reports/` for other agents' recent output to coordinate.

## Keyword Strategy (ASO agents)

1. **No head-on competition with top-10 apps.** Never recommend single-word or two-word keywords owned by ESPN, Yahoo Sports, Medisafe, MyTherapy, Duolingo, or other category leaders with >1M downloads. Always recommend long-tail alternatives.

2. **Keyword rationale required.** For each keyword set variant, include a 1-sentence justification explaining why this keyword is winnable for a new app.

## QA Rigor

1. **Minimum 1 actionable finding per QA review.** If you genuinely find zero issues, you must write a detailed justification for each checked item explaining what you verified and why it passes. "issues: none" without explanation is a review failure.

2. **Check cross-references.** Verify that dates, event names, hashtag counts, CTA links, and claims are internally consistent across all slots.

## Scoreboard and Change Log

1. **Every run must update the scoreboard.** If a `weekly-scoreboard.md` or `change-log.md` exists in the run directory, update it with this run's entry. If it doesn't exist, create one from the template.

2. **Log format:** `| YYYY-MM-DD | agent-name | [summary of what changed or was produced] | [status: new/updated/no-change-justified] |`

## Coverage Equity

1. **All core apps get equal cadence.** If you are scheduled for multiple projects, do not skip any. If you produce 4 runs for SidelineIQ, you must also produce runs for Dosie and Glossy Sports in the same period.
```

**Step 2: Commit**

```bash
cd "/Volumes/Lexar/Projects/infrastructure/agents"
git add includes/marketing-execution-guardrails.md
git commit -m "feat: add shared marketing execution guardrails include"
```

---

### Task 2: Update ASO retention review prompts (all 3 apps)

**Files:**
- Modify: `reviews/sidelineiq/aso-retention-review.md`
- Modify: `reviews/dosie/aso-retention-review.md`
- Modify: `reviews/glossy-sports/aso-retention-review.md`

**Step 1: Add guardrails include reference and iteration section to SidelineIQ ASO prompt**

Insert after the `## Setup` section (after step 4), before `## Core Positioning`:

```markdown
5. **MANDATORY**: Read `includes/marketing-execution-guardrails.md` and follow all rules.
6. Read the most recent `reports/*aso-retention-review*` file. Your output MUST differ from it — see guardrails.

## Iteration Requirements

Before writing your report:
1. Read the previous ASO report in `reports/`.
2. Check today's date against the sports calendar. Which major events are within 2 weeks?
3. If the previous report's keyword recommendations don't reflect the current sports moment, that's your first finding.
4. Read recent `reports/*content-value*` and `reports/*creative-provocateur*` files to see what the social/content agents are focusing on. Align your keywords.

### Long-Tail Keyword Rules
- **NEVER recommend** these terms as primary targets (category leaders own them): "sports news", "live scores", "game updates", "medication reminder", "pill tracker", "sports app", "learn sports"
- **ALWAYS recommend** 3+ long-tail alternatives per keyword set (3-5 word phrases targeting specific use cases)
- **ALWAYS include** a 1-line justification per keyword explaining why it's winnable

### ASO Proposal Rules
- Every field in `aso-proposal.md` MUST be filled. Use `[DATA UNAVAILABLE: reason]` if needed — never leave blank.
- Include at least 2 experiments with specific hypotheses and success criteria.
- If App Store Connect metrics are unavailable, state that explicitly and propose experiments that can be measured through organic download trends.
```

**Step 2: Apply equivalent changes to Dosie ASO prompt**

Same structure, but adjust the "NEVER recommend" list to Dosie-specific terms:
- NEVER: "medication reminder", "pill tracker", "pill reminder", "dose tracker", "medicine timer"
- ALWAYS: long-tail around caregiver coordination, family medication sharing, multi-person dose tracking

**Step 3: Apply equivalent changes to Glossy Sports ASO prompt**

Same structure, adjusted:
- NEVER: "sports news", "live scores", "game updates", "sports alerts", "sports app"
- ALWAYS: long-tail around social survival, sports for non-fans, game day conversation, watch party prep

**Step 4: Commit**

```bash
git add reviews/sidelineiq/aso-retention-review.md reviews/dosie/aso-retention-review.md reviews/glossy-sports/aso-retention-review.md
git commit -m "feat: harden ASO agent prompts with iteration discipline and keyword rules"
```

---

### Task 3: Update content value review prompts (QA rigor)

**Files:**
- Modify: `reviews/sidelineiq/content-value-review.md`
- Modify: `reviews/dosie/content-value-review.md`
- Modify: `reviews/glossy-sports/content-value-review.md`

**Step 1: Add guardrails reference and QA hardening to SidelineIQ content value review**

Insert after `## Setup` section:

```markdown
4. **MANDATORY**: Read `includes/marketing-execution-guardrails.md` and follow all rules.

## QA Standards

Your review is worthless if it finds nothing. A thorough review of any non-trivial content ALWAYS finds at least one improvement opportunity. If you report zero findings:

1. You must include a "Verification Log" section listing each checklist item with 2-3 sentences explaining what you checked and why it passes. Generic "looks good" is not acceptable.
2. Consider these commonly missed issues:
   - Inconsistent terminology across lessons (same concept called different things)
   - Missing alt text or accessibility considerations
   - Difficulty miscalibration (exercise too easy/hard for its tier)
   - Stale references to events, seasons, or dates that have passed
   - CTA inconsistencies between content pieces
```

**Step 2: Apply equivalent QA hardening to Dosie and Glossy content value reviews**

Same QA Standards section, adjusted for each product's content type.

**Step 3: Commit**

```bash
git add reviews/sidelineiq/content-value-review.md reviews/dosie/content-value-review.md reviews/glossy-sports/content-value-review.md
git commit -m "feat: add QA rigor requirements to content value review agents"
```

---

### Task 4: Update creative provocateur prompts (coverage + iteration)

**Files:**
- Modify: `reviews/sidelineiq/creative-provocateur.md`
- Modify: `reviews/dosie/creative-provocateur.md`
- Modify: `reviews/glossy-sports/creative-provocateur.md`

**Step 1: Add guardrails and de-duplication check to SidelineIQ creative provocateur**

Insert after `## Setup` step 2:

```markdown
3. **MANDATORY**: Read `includes/marketing-execution-guardrails.md` and follow all rules.
4. Read ALL previous creative-provocateur reports in `reports/`. Extract the hooks and concepts already proposed. Your 5 new ideas MUST NOT repeat or closely paraphrase any prior idea. If you're running low on fresh angles, explicitly acknowledge it and pivot to a different content format or audience segment.
```

**Step 2: Apply same to Dosie and Glossy Sports creative provocateurs**

**Step 3: Commit**

```bash
git add reviews/sidelineiq/creative-provocateur.md reviews/dosie/creative-provocateur.md reviews/glossy-sports/creative-provocateur.md
git commit -m "feat: add iteration guards to creative provocateur agents"
```

---

### Task 5: Update content writer prompts (coverage enforcement)

**Files:**
- Modify: `reviews/dosie/content-writer.md`
- Modify: `reviews/glossy-sports/content-writer.md`

**Step 1: Add guardrails and output tracking to Dosie content writer**

Insert after `## Setup` step 4:

```markdown
5. **MANDATORY**: Read `includes/marketing-execution-guardrails.md` and follow all rules.
6. Count your existing published posts in `web/src/content/blog/`. If you have published fewer posts than scheduled runs (weekly cadence), flag this as a gap in your report.

## Post-Publication Checklist
After writing the blog post, update or create `reports/content-writer-scoreboard.md`:
| Date | Title | Target Keyword | Status |
|------|-------|---------------|--------|
| YYYY-MM-DD | {title} | {keyword} | published |
```

**Step 2: Apply same to Glossy Sports content writer**

**Step 3: Commit**

```bash
git add reviews/dosie/content-writer.md reviews/glossy-sports/content-writer.md
git commit -m "feat: add output tracking to content writer agents"
```

---

### Task 6: Push all changes

**Step 1: Push to remote**

```bash
cd "/Volumes/Lexar/Projects/infrastructure/agents"
git push
```

**Step 2: Verify**

```bash
git log --oneline -5
```

Expected: 5 new commits for the marketing prompt hardening.
