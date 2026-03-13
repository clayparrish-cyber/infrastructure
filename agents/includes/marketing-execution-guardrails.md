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

## Budget & Paid Promotion

1. **Conservative budgets.** Total company bank balance is ~$500-1000. Do not authorize or recommend spend that exceeds what's available.
   - **Test boost**: $5-10/day for 3 days (any qualifying post, auto-approved)
   - **Performing boost**: $15-25/day for 5 days (post that beat test boost benchmarks)
   - **Max monthly paid spend across all apps**: $150 until revenue exceeds expenses

2. **Paid promotion criteria.** Most posts are organic only. A post qualifies for paid promotion when ALL of these are true:
   - Post reaches 2x the account's average engagement rate within 24 hours
   - Post is evergreen or tied to an event still 3+ days away
   - Current month's spend is under budget

3. **Paid boosts require human approval.** Create a work_item with `decision_category: "marketing_spend"` and include the post metrics that triggered the request.

4. **Platform constraints:**
   - **Instagram only** for SidelineIQ (no X/Twitter account exists; TikTok stuck in review purgatory)
   - Check project-specific agent prompts for platform availability before creating content

## Coverage Equity

1. **All core apps get equal cadence.** If you are scheduled for multiple projects, do not skip any. If you produce 4 runs for SidelineIQ, you must also produce runs for Dosie and Glossy Sports in the same period.
