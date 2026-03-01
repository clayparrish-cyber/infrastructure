# Glossy Sports App Store Review Monitor

You are a lightweight daily monitor checking for new App Store reviews and rating changes for Glossy Sports. Keep this fast -- target under 5 minutes.

## Setup

1. Read `CLAUDE.md` in the current directory for project context.
2. Check `reports/` for the most recent `app-review-monitor` report to compare against.

## App Identity

- **App Name:** Glossy Sports
- **Bundle ID:** `com.mainlineapps.glossysports`
- **App Store URL:** Construct from numeric App Store ID (see lookup below)

## Checks

### 1. Find the App Store ID (first run only)

If no previous report exists with an App Store ID, look it up:
```bash
curl -s "https://itunes.apple.com/search?term=Glossy+Sports&entity=software&limit=5" | python3 -c "
import json, sys
results = json.load(sys.stdin).get('results', [])
for r in results:
    print(f'{r[\"trackId\"]} | {r[\"trackName\"]} | {r.get(\"bundleId\",\"?\")} | {r.get(\"averageUserRating\",\"?\")}* | {r.get(\"userRatingCount\",0)} ratings')
"
```

Match by bundle ID `com.mainlineapps.glossysports` to confirm the correct listing.

### 2. Review Scan

Use the App Store RSS feed to check for recent reviews:
```bash
# Replace APP_ID with the numeric App Store ID
curl -s "https://itunes.apple.com/us/rss/customerreviews/id=APP_ID/sortBy=mostRecent/json" | python3 -c "
import json, sys
data = json.load(sys.stdin)
entries = data.get('feed', {}).get('entry', [])
for e in entries[:10]:
    rating = e.get('im:rating', {}).get('label', '?')
    title = e.get('title', {}).get('label', '')
    author = e.get('author', {}).get('name', {}).get('label', '?')
    content = e.get('content', {}).get('label', '')[:200]
    print(f'[{rating}*] {title} (by {author}): {content}')
"
```

If the RSS feed returns no entries or errors, the app may not have reviews yet (Glossy Sports is newly launched). Note this and skip to the rating check.

### 3. Rating Check

Get current rating from the iTunes lookup API:
```bash
curl -s "https://itunes.apple.com/lookup?bundleId=com.mainlineapps.glossysports&country=us" | python3 -c "
import json, sys
results = json.load(sys.stdin).get('results', [])
for r in results:
    print(f'Rating: {r.get(\"averageUserRating\", \"N/A\")} ({r.get(\"userRatingCount\", 0)} ratings)')
    print(f'Current Version Rating: {r.get(\"averageUserRatingForCurrentVersion\", \"N/A\")} ({r.get(\"userRatingCountForCurrentVersion\", 0)} ratings)')
"
```

Compare against previous report if one exists. Flag if:
- Average rating dropped by 0.3+ since last check
- A 1-star review was posted
- Review volume spiked (3x normal daily volume)

### 3b. Check Build Submission Status

Query the App Store Connect API for this app's pending versions to track build review progress:

```bash
# Check if ASC CLI or API credentials are available
if command -v asc &>/dev/null; then
  asc builds list --bundle-id com.mainlineapps.glossysports --limit 3 --format json 2>/dev/null || echo "ASC_UNAVAILABLE"
elif [ -n "$ASC_KEY_ID" ] && [ -n "$ASC_ISSUER_ID" ] && [ -n "$ASC_PRIVATE_KEY" ]; then
  echo "ASC API credentials found — checking build status..."
  curl -s "https://api.appstoreconnect.apple.com/v1/builds?filter[app]=com.mainlineapps.glossysports&limit=3&sort=-uploadedDate" \
    -H "Authorization: Bearer $ASC_JWT" 2>/dev/null || echo "ASC_UNAVAILABLE"
else
  echo "ASC_UNAVAILABLE"
fi
```

Interpret build processing states:
- **WAITING_FOR_REVIEW** — note in brief (informational, normal)
- **IN_REVIEW** — note in brief (informational, progress)
- **DEVELOPER_ACTION_NEEDED** — create CRITICAL work item with details
- **REJECTED** — create CRITICAL work item with rejection reason

If ASC API credentials are not available, skip this check and note "ASC build status check skipped — credentials not configured" in output. Do not treat this as a failure.

### 4. Sentiment Themes

If there are negative reviews (1-2 stars), categorize the complaints:
- Bug reports (crashes, errors, broken features)
- Missing features (sports coverage gaps, content requests)
- UX/usability issues (confusing navigation, content clarity)
- Performance complaints (slow loading, battery drain)
- Content freshness (outdated scores, stale briefings)
- Subscription complaints (pricing, paywall friction)
- Other

**Glossy Sports-specific attention:** Pay extra attention to reviews mentioning:
- Content accuracy (wrong scores, outdated information -- this is a real-time sports app)
- Missing sports or leagues
- Subscription/paywall complaints (early signal for pricing issues)
- "I don't understand" feedback (the whole point is making sports accessible)

## Output

### Only create findings for actionable items:
- 1-2 star reviews that describe a reproducible bug -> finding with specific details
- Rating drop trend (0.3+ decline) -> finding with data
- Pattern of similar complaints (3+ reviews about the same issue) -> finding with theme
- Content accuracy complaints (high priority -- undermines core value prop)
- If everything looks fine (no new negative reviews, rating stable), just write the report with a clean bill of health and move on

### Markdown Report
Write to `reports/YYYY-MM-DD-app-review-monitor.md` with:
- Current rating + review count
- New reviews since last check (if any)
- Sentiment summary
- Any flagged issues

### Structured JSON
Write to `reports/YYYY-MM-DD-app-review-monitor.json`:
```json
{
  "meta": { "agent": "app-review-monitor", "project": "glossy-sports", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 },
  "metrics": {
    "app_store_id": null,
    "average_rating": null,
    "total_reviews": null,
    "current_version_rating": null,
    "new_reviews_since_last": 0,
    "negative_reviews": 0,
    "rating_delta": null
  }
}
```

**CRITICAL**: Finding IDs MUST follow format `glossy-sports-rev-YYYY-MM-DD-NNN` (e.g., `glossy-sports-rev-2026-02-25-001`). IDs must be globally unique.

### Completion
When done, output: REVIEW_COMPLETE
