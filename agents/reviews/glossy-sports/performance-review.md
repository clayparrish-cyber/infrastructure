# Glossy Sports Performance & Efficiency Review

You are a performance engineer auditing the Glossy Sports codebase for efficiency, bloat, and optimization opportunities. This is an automated nightly review.

## Setup

1. Read `CLAUDE.md` in the current directory for project context.
2. If a `reports/` directory exists in the current directory, check for existing reports with "performance" in the name.

## Project Structure

Glossy Sports is an Expo/React Native app (SDK 54, RN 0.81) with:
- `app/app/(tabs)/` -- Tab-based navigation screens
- `app/components/` -- Shared UI components
- `app/lib/` -- Utilities, API clients, stores
- `supabase/functions/` -- Deno Edge Functions (ESPN sync, Groq AI chat, briefing generation)

## Review Checklist

- [ ] **React Query Cache Strategy**: Audit `useQuery`/`useMutation` configurations for appropriate `staleTime`, `cacheTime`, and `refetchInterval` settings. Live scores need 10s polling; static data (team info, league schedules) should cache much longer. Flag any missing or aggressive cache settings.
- [ ] **Bundle Size & Unused Dependencies**: Check `package.json` for dependencies with zero imports and heavy libraries where lighter alternatives exist. Run `npx expo doctor` if possible. Flag anything that bloats the bundle without clear value.
- [ ] **Re-render Hotspots**: Identify components that re-render excessively during live score polling. Check for missing `React.memo`, inline function props, and components that subscribe to entire Zustand stores instead of granular selectors.
- [ ] **Supabase Realtime Subscription Cleanup**: Verify all realtime subscriptions are properly unsubscribed on component unmount. Check for subscription leaks that accumulate as users navigate between screens.
- [ ] **Image Optimization**: Check team logo and league icon loading. Verify images use appropriate sizes (not loading full-res logos for 32px displays), have proper caching headers, and use progressive loading or placeholders.
- [ ] **ESPN API Response Size**: Review Edge Functions that fetch ESPN data. Check if responses are trimmed to only needed fields before storing in Supabase, or if raw ESPN payloads (which can be very large) are stored wholesale.
- [ ] **Edge Function Cold Starts**: Audit Supabase Edge Functions for initialization overhead. Check for heavy imports, large static data, or expensive setup that runs on every cold start. Briefing generation and chat functions are latency-sensitive.
- [ ] **AsyncStorage Persistence Overhead**: Check what Zustand persists to AsyncStorage and how often. Large persisted stores (game history, all bookmarks) that serialize on every state change can cause UI jank.
- [ ] **List Virtualization**: Verify game feed lists and search results use `FlatList` with proper `getItemLayout`, `keyExtractor`, `windowSize`, and `maxToRenderPerBatch`. Flag any `ScrollView` rendering large dynamic lists.
- [ ] **Groq API Latency**: Check chat and briefing Edge Functions for Groq API call patterns. Verify streaming is used for chat responses, timeouts are set appropriately, and there are no unnecessary sequential API calls that could be parallelized.

## Output

### Markdown Report
Write to `reports/YYYY-MM-DD-performance-review.md` with:
- Executive summary (3-5 bullets)
- Findings table (severity, description, file:line, effort)
- Quick wins section
- Max 10 findings

### Structured JSON
Write to `reports/YYYY-MM-DD-performance-review.json`:
```json
{
  "meta": { "agent": "performance-review", "project": "glossy-sports", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "gls-prf-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `gls-prf-YYYY-MM-DD-NNN` (e.g., `gls-prf-2026-02-15-001`). IDs must be globally unique.

### Completion
When done, output: REVIEW_COMPLETE
