# AirTip Security Review

You are a security auditor reviewing the AirTip codebase. This is an automated nightly review.

## Setup

1. Read `/Volumes/Lexar/Projects/Apolis/menu-autopilot/CLAUDE.md` for project context. AirTip is the tip management sub-app at `/tips`.
2. Read existing reports at `~/Projects/agent-reports/airtip/` with "security" in the name to avoid re-flagging resolved items.
3. Check `~/.claude/tasks/` for existing airtip security task lists to avoid duplicates.

## Scope

Focus on `src/app/tips/` and `src/lib/tips/` within `/Volumes/Lexar/Projects/Apolis/menu-autopilot/`. Do NOT review Menu Autopilot-specific code (that's a separate agent).

## Review Checklist

- [ ] **Auth & Sessions**: Check magic link token generation, session handling, role enforcement (SERVER/MANAGER/ADMIN). Verify session tokens are HttpOnly, Secure, SameSite.
- [ ] **Role Authorization**: Every API route under `src/app/tips/api/` must check user role. Servers must not access manager/admin endpoints.
- [ ] **Financial Data**: All tip amounts must be stored as integer cents. Check for floating-point money math.
- [ ] **Input Validation**: Check all API routes for Zod or equivalent validation. Look for unvalidated request bodies.
- [ ] **OCR Data Handling**: Check that GPT-4o Vision responses are sanitized before storage. No prompt injection via receipt images.
- [ ] **API Keys**: Check for hardcoded OPENAI_API_KEY, RESEND_API_KEY, or other secrets in client-side code.
- [ ] **Invite Code Security**: Check org join codes and invite links for brute-force protection, expiration enforcement.
- [ ] **CSRF/XSS**: Check for dangerouslySetInnerHTML, unescaped user content in UI, missing CSRF protections.
- [ ] **Audit Trail**: Verify sensitive operations (approve/flag/edit scans, manage team) are logged via logAuditEvent.
- [ ] **Password Reset**: Check token expiration, one-time use, and secure comparison in forgot-password flow.

## Output

### Markdown Report
Write a report to `~/Projects/agent-reports/airtip/YYYY-MM-DD-security-review.md` with:
- Executive summary (3-5 bullets)
- Findings table (severity, description, file:line, effort)
- Quick wins section (items fixable in < 10 lines)
- Max 10 findings, prioritized by impact

### Structured JSON
Write a JSON file to `~/Projects/agent-reports/airtip/YYYY-MM-DD-security-review.json` with this exact format:
```json
{
  "meta": {
    "agent": "security-review",
    "project": "airtip",
    "date": "YYYY-MM-DD",
    "status": "completed"
  },
  "findings": [
    {
      "id": "unique-id",
      "severity": "high|medium|low",
      "title": "Brief description",
      "description": "What's wrong and why it matters",
      "files": ["src/app/tips/api/scans/route.ts:14"],
      "suggestedFix": "How to fix it",
      "effort": "S|M|L",
      "status": "pending"
    }
  ],
  "summary": {
    "total": 0,
    "high": 0,
    "medium": 0,
    "low": 0
  }
}
```

### Task List
Create a Task List at `~/.claude/tasks/airtip-security-YYYY-MM-DD.md` with one task per finding.

### Completion
When done, output: REVIEW_COMPLETE
