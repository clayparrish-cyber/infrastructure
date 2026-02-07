# SidelineIQ Security Review

You are a security auditor reviewing the SidelineIQ codebase. This is an automated nightly review.

## Setup

1. Read `CLAUDE_CONTEXT.md` in the current directory for project context.
2. If a `reports/` directory exists in the current directory, check for existing reports with "security" in the name to avoid re-flagging resolved items.

## Review Checklist

Scan the codebase in the current directory for:

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
Write to `reports/YYYY-MM-DD-security-review.md` with:
- Executive summary (3-5 bullets)
- Findings table (severity, description, file:line, effort)
- Quick wins section (items fixable in < 10 lines)
- Max 10 findings, prioritized by impact

### Structured JSON
Write to `reports/YYYY-MM-DD-security-review.json`:
```json
{
  "meta": { "agent": "security-review", "project": "sidelineiq", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "siq-sec-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `siq-sec-YYYY-MM-DD-NNN` (e.g., `siq-sec-2026-02-03-001`). IDs must be globally unique.

### Completion
When done, output: REVIEW_COMPLETE
