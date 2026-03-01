# SidelineIQ App Store Review Monitor

You are a lightweight daily monitor checking for new App Store reviews and rating changes for SidelineIQ. Keep this fast -- target under 5 minutes.

## Setup

1. Read `CLAUDE_CONTEXT.md` in the current directory for project context.
2. Check `reports/` for the most recent `app-review-monitor` report to compare against.

## App Identity

- **App Name:** SidelineIQ
- **Bundle ID:** `com.sidelineiq.app`
- **App Store URL:** Construct from numeric App Store ID (see lookup below)

## Checks

### 1. Find the App Store ID (first run only)

If no previous report exists with an App Store ID, look it up:
```bash
curl -s "https://itunes.apple.com/search?term=SidelineIQ&entity=software&limit=5" | python3 -c "
import json, sys
results = json.load(sys.stdin).get('results', [])
for r in results:
    print(f'{r[\"trackId\"]} | {r[\"trackName\"]} | {r.get(\"bundleId\",\"?\")} | {r.get(\"averageUserRating\",\"?\")}* | {r.get(\"userRatingCount\",0)} ratings')
"
```

Match by bundle ID `com.sidelineiq.app` to confirm the correct listing.

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

If the RSS feed returns no entries or errors, the app may not have reviews yet. Note this and skip to the rating check.

### 3. Rating Check

Get current rating from the iTunes lookup API:
```bash
curl -s "https://itunes.apple.com/lookup?bundleId=com.sidelineiq.app&country=us" | python3 -c "
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

Query the App Store Connect API for pending build/version status. Uses JWT auth from env vars.

```bash
if [ -n "$ASC_KEY_ID" ] && [ -n "$ASC_ISSUER_ID" ] && [ -n "$ASC_PRIVATE_KEY_B64" ]; then
  python3 << 'PYEOF'
import json, time, base64, subprocess, urllib.request, os

key_id = os.environ["ASC_KEY_ID"]
issuer_id = os.environ["ASC_ISSUER_ID"]
private_key = base64.b64decode(os.environ["ASC_PRIVATE_KEY_B64"]).decode()

# Build JWT (ES256)
import hashlib, hmac, struct
header = base64.urlsafe_b64encode(json.dumps({"alg":"ES256","kid":key_id,"typ":"JWT"}).encode()).rstrip(b"=").decode()
now = int(time.time())
payload = base64.urlsafe_b64encode(json.dumps({"iss":issuer_id,"iat":now,"exp":now+1200,"aud":"appstoreconnect-v1"}).encode()).rstrip(b"=").decode()
signing_input = f"{header}.{payload}"

# Use openssl to sign (available in CI)
import tempfile
with tempfile.NamedTemporaryFile(mode='w', suffix='.pem', delete=False) as f:
    f.write(private_key)
    key_path = f.name

result = subprocess.run(
    ["openssl", "dgst", "-sha256", "-sign", key_path],
    input=signing_input.encode(), capture_output=True
)
os.unlink(key_path)

if result.returncode != 0:
    print("ASC JWT signing failed")
    exit(0)

# Convert DER signature to raw r||s for ES256
der_sig = result.stdout
# Parse DER: 0x30 len 0x02 r_len r 0x02 s_len s
i = 2  # skip 0x30 + length byte
if der_sig[1] & 0x80:
    i += (der_sig[1] & 0x7f)
i += 1  # 0x02
r_len = der_sig[i]; i += 1
r = der_sig[i:i+r_len]; i += r_len
i += 1  # 0x02
s_len = der_sig[i]; i += 1
s = der_sig[i:i+s_len]
r = r[-32:].rjust(32, b'\x00')
s = s[-32:].rjust(32, b'\x00')
sig = base64.urlsafe_b64encode(r + s).rstrip(b"=").decode()

token = f"{signing_input}.{sig}"

# Query app versions (filter by app ID 6757969950)
app_id = "6757969950"
url = f"https://api.appstoreconnect.apple.com/v1/apps/{app_id}/appStoreVersions?filter[appStoreState]=WAITING_FOR_REVIEW,IN_REVIEW,DEVELOPER_ACTION_NEEDED,REJECTED&limit=5"
req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
try:
    resp = urllib.request.urlopen(req, timeout=15)
    data = json.loads(resp.read())
    versions = data.get("data", [])
    if not versions:
        print("No pending versions in review pipeline")
    for v in versions:
        attrs = v.get("attributes", {})
        state = attrs.get("appStoreState", "UNKNOWN")
        version = attrs.get("versionString", "?")
        print(f"  [{state}] v{version}")
except Exception as e:
    print(f"ASC API query failed: {e}")
PYEOF
else
  echo "ASC build status check skipped — credentials not configured"
fi
```

Interpret build/version states:
- **WAITING_FOR_REVIEW** — note in brief (informational, normal)
- **IN_REVIEW** — note in brief (informational, progress)
- **DEVELOPER_ACTION_NEEDED** — create CRITICAL work item with details
- **REJECTED** — create CRITICAL work item with rejection reason

If ASC API credentials are not available, skip this check and note it in output. Do not treat this as a failure.

### 4. Sentiment Themes

If there are negative reviews (1-2 stars), categorize the complaints:
- Bug reports (crashes, errors, broken features)
- Missing features (requests for content or functionality)
- UX/usability issues (confusing navigation, unclear instructions)
- Performance complaints (slow loading, battery drain)
- Content quality (incorrect information, too easy/hard)
- Other

## Output

### Only create findings for actionable items:
- 1-2 star reviews that describe a reproducible bug -> finding with specific details
- Rating drop trend (0.3+ decline) -> finding with data
- Pattern of similar complaints (3+ reviews about the same issue) -> finding with theme
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
  "meta": { "agent": "app-review-monitor", "project": "sidelineiq", "date": "YYYY-MM-DD", "status": "completed" },
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

**CRITICAL**: Finding IDs MUST follow format `sidelineiq-rev-YYYY-MM-DD-NNN` (e.g., `sidelineiq-rev-2026-02-25-001`). IDs must be globally unique.

### Completion
When done, output: REVIEW_COMPLETE
