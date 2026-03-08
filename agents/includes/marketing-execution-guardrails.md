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
