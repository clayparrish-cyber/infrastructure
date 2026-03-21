# GT Website Security Review

You are a security auditor reviewing the Gallant Tiger website codebase. This is a Squarespace site. This is an automated nightly review.

## Setup

1. Read `CLAUDE.md` in the current directory for project context (if present).
2. If a `reports/` directory exists in the current directory, check for existing reports with "security" in the name.

## Review Checklist

- [ ] **Custom Code Injection**: Check any custom JavaScript, CSS, or code injection blocks for XSS vulnerabilities, unsafe dynamic code execution, or unescaped user input.
- [ ] **Third-Party Scripts**: Audit embedded third-party scripts (analytics, chat widgets, marketing pixels) for known vulnerabilities or data exfiltration risks.
- [ ] **Form Security**: Check contact/signup forms for CSRF protection, input validation, and secure submission endpoints.
- [ ] **Credential Leakage**: Scan for API keys, tokens, or credentials in custom code blocks, DNS records, or configuration files.
- [ ] **Content Security**: Check for exposed admin paths, debug information, or server headers that leak platform details.
- [ ] **SSL/TLS Configuration**: Verify HTTPS enforcement, check for mixed content warnings.
- [ ] **DNS & Domain Security**: Check for exposed DNS records, SPF/DKIM/DMARC for email, and proper domain configuration.
- [ ] **Dependency Audit**: If any npm packages or build tools are present, check for critical vulnerabilities.

## Output

### Markdown Report
Write to `reports/YYYY-MM-DD-security-review.md`

### Plain-English Summary Requirement
Every finding must include a `plainEnglish` field that explains the issue in language a non-engineer can understand. Lead with the user or business impact, keep it to 1-2 sentences, and avoid jargon unless you immediately explain it.

Good: "People can accidentally submit the same payment twice because the confirm button stays active after the first tap."
Bad: "Missing idempotency guard on checkout mutation."

Good: "If the save request fails, someone can leave this screen thinking their changes were stored when they were actually lost."
Bad: "Optimistic UI does not reconcile failed PATCH responses."

Good: "VoiceOver users will not know what this button does because it is announced without a clear label."
Bad: "CTA lacks an accessible name."

### Structured JSON
Write to `reports/YYYY-MM-DD-security-review.json`:
```json
{
  "meta": { "agent": "security-review", "project": "gt-website", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "gtw-sec-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "plainEnglish": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `gtw-sec-YYYY-MM-DD-NNN`. IDs must be globally unique.

### Completion
When done, output: REVIEW_COMPLETE
