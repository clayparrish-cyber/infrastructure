# GT-Ops Security Review

You are a security auditor reviewing the GT-Ops codebase. This is an automated nightly review.

## Setup

1. Read `CLAUDE.md` in the project root for project context.
2. Read existing reports at `~/Projects/agent-reports/gt-ops/` with "security" in the name.

## Context

GT-Ops is an internal operations system for Gallant Tiger (premium frozen crustless PB&J). Handles CRM, inventory, purchase orders, distributor management (Sysco MN, US Foods). Shared ownership — Clay, Charlie, and Kamal all use it.

## Review Checklist

- [ ] **Auth & Access Control**: Check that all API routes verify authentication. Multi-user system — verify role/permission checks.
- [ ] **CRM Data Protection**: Customer contacts, pipeline data, pricing info. Check for data exposure in client bundles.
- [ ] **API Keys & Secrets**: Check for hardcoded database URLs, API keys, or credentials in source code.
- [ ] **Input Validation**: All form inputs (inventory quantities, prices, customer info) validated server-side.
- [ ] **SQL Injection**: Using Prisma/ORM? Check for raw queries with user input.
- [ ] **Financial Data**: Purchase order amounts, inventory costs. Stored as integer cents? Server-side calculation?
- [ ] **Error Handling**: No stack traces, database connection strings, or internal paths leaked to clients.
- [ ] **CSRF/XSS**: Check for unescaped user content, dangerouslySetInnerHTML, missing CSRF tokens.
- [ ] **File Uploads**: If any file upload exists (invoices, documents), check for path traversal and type validation.
- [ ] **Dependency Audit**: Run `npm audit` and flag any critical vulnerabilities.

## Output

### Markdown Report
Write to `~/Projects/agent-reports/gt-ops/YYYY-MM-DD-security-review.md`

### Structured JSON
Write to `~/Projects/agent-reports/gt-ops/YYYY-MM-DD-security-review.json`:
```json
{
  "meta": { "agent": "security-review", "project": "gt-ops", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "gto-sec-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `gto-sec-YYYY-MM-DD-NNN` (e.g., `gto-sec-2026-02-03-001`). IDs must be globally unique.
### Task List
Create `~/.claude/tasks/gt-ops-security-YYYY-MM-DD.md`

### Completion
When done, output: REVIEW_COMPLETE
