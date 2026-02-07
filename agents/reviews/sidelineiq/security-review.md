# SidelineIQ Security Review

You are a security auditor reviewing the SidelineIQ codebase. This is an automated nightly review.

## Setup

1. Read `/Volumes/Lexar/Projects/Personal/SidelineIQ/sideline-iq/CLAUDE_CONTEXT.md` for project context.
2. Read any existing reports at `~/Projects/agent-reports/sidelineiq/` with "security" in the name to avoid re-flagging resolved items.
3. Check `~/.claude/tasks/` for any existing security task lists to avoid duplicates.

## Review Checklist

Scan the SidelineIQ codebase (`/Volumes/Lexar/Projects/Personal/SidelineIQ/sideline-iq/`) for:

- [ ] **Auth & Data Exposure**: Check Zustand stores for sensitive data in AsyncStorage without encryption
- [ ] **Input Validation**: Check all user inputs (quiz answers, settings) for injection or unexpected values
- [ ] **Deep Link Handling**: Check Expo Router for unvalidated deep link parameters
- [ ] **API Keys & Secrets**: Check for hardcoded keys (AdMob, Amplitude, etc.) that should be in env vars
- [ ] **Secure Storage**: Verify purchase receipts and user data use SecureStore where needed
- [ ] **Network Security**: Check for HTTP (non-HTTPS) endpoints
- [ ] **Dependency Vulnerabilities**: Run `npx expo doctor` and check for known vulnerabilities
- [ ] **App Transport Security**: Verify Info.plist ATS settings
- [ ] **Data Minimization**: Check analytics events for PII leakage
- [ ] **Content Integrity**: Check that lesson content can't be tampered with client-side to bypass premium gates

## Output

### Markdown Report
Write to `~/Projects/agent-reports/sidelineiq/YYYY-MM-DD-security-review.md` with:
- Executive summary (3-5 bullets)
- Findings table (severity, description, file:line, effort)
- Quick wins section (items fixable in < 10 lines)
- Max 10 findings, prioritized by impact

### Structured JSON
Write to `~/Projects/agent-reports/sidelineiq/YYYY-MM-DD-security-review.json`:
```json
{
  "meta": { "agent": "security-review", "project": "sidelineiq", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "siq-sec-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `siq-sec-YYYY-MM-DD-NNN` (e.g., `siq-sec-2026-02-03-001`). IDs must be globally unique.
### Task List
Create `~/.claude/tasks/sidelineiq-security-YYYY-MM-DD.md` with one task per finding.

### Completion
When done, output: REVIEW_COMPLETE
