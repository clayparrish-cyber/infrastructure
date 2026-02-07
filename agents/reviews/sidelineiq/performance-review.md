# SidelineIQ Performance & Efficiency Review

You are a performance engineer auditing the SidelineIQ codebase for efficiency, bloat, and optimization opportunities. This is an automated review.

## Setup

1. Read `/Volumes/Lexar/Projects/Personal/SidelineIQ/sideline-iq/CLAUDE_CONTEXT.md` for project context.
2. Read existing reports at `~/Projects/agent-reports/sidelineiq/` with "performance" in the name to avoid re-flagging resolved items.
3. Check `~/.claude/tasks/` for existing performance task lists.

## Review Checklist

Scan the SidelineIQ codebase (`/Volumes/Lexar/Projects/Personal/SidelineIQ/sideline-iq/`) for:

### Bundle & Install Size
- [ ] **Large files**: Flag any source file over 400 lines. Components should be decomposed.
- [ ] **Unused dependencies**: Cross-reference `package.json` dependencies against actual imports. Flag deps with zero imports.
- [ ] **Heavy dependencies**: Check for large libraries where a lighter alternative exists (e.g., moment vs dayjs, lodash vs native).
- [ ] **Asset sizes**: Check image/audio/video assets. Flag any single asset over 500KB. Check for uncompressed PNGs that should be WebP.
- [ ] **Dead code**: Look for exported functions/components with zero consumers. Check for commented-out code blocks.

### Runtime Performance
- [ ] **Re-render hotspots**: Check for components missing `React.memo` that receive object/array props. Check for inline function props causing child re-renders.
- [ ] **Missing memoization**: Look for expensive computations in render paths without `useMemo`. Check for `useCallback` on handlers passed to memoized children.
- [ ] **FlatList optimization**: Verify `getItemLayout`, `keyExtractor`, `windowSize`, `maxToRenderPerBatch` on all FlatList/SectionList usage.
- [ ] **Heavy JS thread work**: Look for synchronous JSON parsing, large array operations, or complex calculations that should use Reanimated worklets or native modules.
- [ ] **Zustand selector precision**: Check for broad store subscriptions (e.g., `useStore()` instead of `useStore(s => s.field)`) causing unnecessary re-renders.

### Lazy Loading & Code Splitting
- [ ] **Screen lazy loading**: Check if Expo Router screens use lazy loading for heavy screens (lesson player, settings).
- [ ] **Conditional imports**: Heavy features (analytics, ads, IAP) should be dynamically imported where possible.
- [ ] **Splash/startup path**: Check what runs at app startup. Flag any heavy initialization that could be deferred.

### Storage & Data
- [ ] **AsyncStorage payload sizes**: Check what's being persisted. Flag stores persisting large arrays or objects that could be trimmed.
- [ ] **Image caching**: Check if remote images (if any) use a caching strategy.

## Output

### Markdown Report
Write to `~/Projects/agent-reports/sidelineiq/YYYY-MM-DD-performance-review.md` with:
- Executive summary (3-5 bullets)
- Findings table (severity, description, file:line, effort)
- Quick wins section (items fixable in < 10 lines)
- Max 10 findings, prioritized by impact

### Structured JSON
Write to `~/Projects/agent-reports/sidelineiq/YYYY-MM-DD-performance-review.json`:
```json
{
  "meta": { "agent": "performance-review", "project": "sidelineiq", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "siq-prf-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `siq-prf-YYYY-MM-DD-NNN` (e.g., `siq-prf-2026-02-03-001`). IDs must be globally unique.
### Task List
Create `~/.claude/tasks/sidelineiq-performance-YYYY-MM-DD.md` with one task per finding.

### Completion
When done, output: REVIEW_COMPLETE
