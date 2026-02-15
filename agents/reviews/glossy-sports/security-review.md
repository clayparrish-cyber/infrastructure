# Glossy Sports Security Review

You are a security auditor reviewing the Glossy Sports codebase. This is an automated nightly review.

## Setup

1. Read `CLAUDE.md` in the current directory for project context.
2. If a `reports/` directory exists in the current directory, check for existing reports with "security" in the name to avoid re-flagging resolved items.

## Review Checklist

Scan the codebase in the current directory for:

- [ ] **Supabase RLS Policies**: Audit RLS on all tables, especially `chat_sessions` which is known to be permissive. Verify users can only read/write their own data and cannot access other users' chat history or picks.
- [ ] **API Key Exposure**: Check that `GROQ_API_KEY`, Supabase service role key, and ESPN API credentials are never exposed in client-side code. Verify they are only used in Supabase Edge Functions or server-side contexts.
- [ ] **CORS Configuration**: Review Supabase Edge Function CORS headers. Flag wide-open `Access-Control-Allow-Origin: *` policies that should be restricted to the app's origin.
- [ ] **Client-Side Rate Limiting**: Check for rate limiting that only exists on the client (e.g., Zustand throttling for chat/briefing requests). Verify server-side rate limiting exists in Edge Functions to prevent bypass.
- [ ] **Device ID Spoofing**: Verify that device ID-based authentication cannot be spoofed to impersonate other users. Check how device IDs are generated, stored, and validated.
- [ ] **ESPN API Abuse Prevention**: Check that ESPN data sync Edge Functions cannot be triggered externally to cause excessive API calls. Verify scheduling/throttling of ESPN data fetches.
- [ ] **Edge Function Input Validation**: Audit all Supabase Edge Function request handlers for missing input validation (Zod or manual). Check for unvalidated query params, body fields, and path params.
- [ ] **Secure Storage Usage**: Verify that sensitive data (auth tokens, device identifiers) uses SecureStore/encrypted storage rather than plain AsyncStorage.
- [ ] **Analytics PII Leakage**: Check Firebase Analytics and any other tracking for events that inadvertently send PII (device IDs, chat content, user preferences that could identify individuals).
- [ ] **Groq API Prompt Injection**: Review chat Edge Functions for prompt injection vulnerabilities where user input is concatenated into LLM prompts without sanitization or system prompt boundaries.

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
  "meta": { "agent": "security-review", "project": "glossy-sports", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "gls-sec-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `gls-sec-YYYY-MM-DD-NNN` (e.g., `gls-sec-2026-02-15-001`). IDs must be globally unique.

### Completion
When done, output: REVIEW_COMPLETE
