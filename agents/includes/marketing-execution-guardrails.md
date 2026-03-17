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

## Content Quality Standards (Added 2026-03-16)

These rules come from a human review of all marketing agent output. Follow them strictly.

### Distribution > Generation

1. **Content without distribution is waste.** If you generate a blog post, social batch, or email template, verify it can actually be published. Reference real image assets (not placeholder paths), real platform accounts, and real app features.
2. **Track publication status.** If a prior run's content was never posted, flag it in your report. Don't generate new content when old content is sitting unpublished.
3. **One-shot generation isn't a pipeline.** Each run should reference and extend prior runs. "Week 1 batch" with no Weeks 2-52 is a failure. Build continuity.

### Length & Self-Editing

4. **Respect your word count targets.** If the prompt says 800-1200 words, stay under 1200. A 2,500-word blog post when the target is 1,200 means you aren't self-editing. Cut ruthlessly — the reader who needs "what is March Madness" explained isn't going to read 2,500 words.
5. **Place CTAs at peak interest, not just at the bottom.** After the section where the reader's engagement peaks (typically the core explainer), add a mid-article CTA. Most readers never reach the bottom.

### Accuracy & Freshness

6. **Never hardcode app-specific numbers that can change.** Don't write "43 lessons" or "12 sports" — use flexible language like "dozens of lessons" or "every major sport." Hardcoded specifics rot when the app updates.
7. **Never reference images that don't exist.** If you include an image path in frontmatter, verify the file exists in the repo. AI agents cannot create images — omit the image field rather than pointing to a non-existent file.
8. **Frontmatter must match the spec exactly.** Use the field names specified in your prompt (`publishedAt` not `date`, include `author` and `tags`). Mismatched frontmatter breaks the content pipeline.

### Platform Compliance

9. **Read and obey platform constraints before generating content.** If the guardrails say "Instagram only" for a project, do not generate TikTok or X/Twitter content for that project. This is not optional. Check the guardrails FIRST, then generate.
10. **AI video prompts must be technically feasible.** Do not write Veo/Sora prompts that require multi-scene cuts, split screens, precise text overlays, or timed transitions — current AI video tools cannot reliably produce these. Keep prompts to single continuous scenes. For multi-scene content, use Zebracat or flag for human editing.

### Social Content Substance

11. **Social copy must be postable as-is.** A hook + one generic sentence is a placeholder, not content. Each social post must contain enough substance to actually post — a specific claim, fact, talking point, or joke. "Openers, names, vibes. You'll be fine." is not a post.
12. **Every social batch must reference current sports events.** Check today's date and name the specific games, matchups, teams, or events happening this week. Generic "the game" references add zero value for an audience that needs specific talking points.
13. **Use niche hashtags for discovery.** Brand hashtags (#glossysports, #SidelineIQ) are for tracking, not discovery. Every post needs 3-5 niche hashtags the target audience actually follows (e.g., #sportsconfused #newtofoootball #footballforwives, not #nfl #football).
