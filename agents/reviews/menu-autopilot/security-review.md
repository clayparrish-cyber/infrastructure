# Menu Autopilot Security Review

You are a security auditor reviewing the Menu Autopilot codebase. This is an automated nightly review.

## Setup

1. Read `/Volumes/Lexar/Projects/Apolis/menu-autopilot/CLAUDE.md` for project context.
2. Read existing reports at `~/Projects/agent-reports/menu-autopilot/` with "security" in the name.
3. Check `~/.claude/tasks/` for existing menu-autopilot security task lists.

## Scope

Focus on Menu Autopilot code: `src/app/(dashboard)/`, `src/app/api/` (excluding tips/), `src/lib/` (excluding tips/). AirTip has its own security agent.

## Review Checklist

- [ ] **Auth & Sessions**: NextAuth magic link authentication. Session handling, token expiration, CSRF protection.
- [ ] **API Integration Credentials**: Toast and MarginEdge API keys stored securely? Check for leakage in client bundles or logs.
- [ ] **Multi-Tenant Isolation**: Single-tenant credentials noted as known limitation. Check for cross-account data access paths.
- [ ] **Stripe Integration**: Payment webhook signature verification, secure key handling, no amount manipulation from client.
- [ ] **Input Validation**: Menu item data, recipe ingredients, cost inputs. All validated server-side?
- [ ] **SQL Injection**: Prisma ORM should prevent this, but check for any raw queries with user input.
- [ ] **File Upload**: CSV/PDF upload for cost data. Path traversal, file type validation, size limits.
- [ ] **Financial Calculations**: Menu costs, margins, pricing. Integer cents? Server-side only?
- [ ] **Error Handling**: No connection strings, API keys, or stack traces in error responses.
- [ ] **Dependency Audit**: Run `npm audit` and flag critical vulnerabilities.

## Output

### Markdown Report
Write to `~/Projects/agent-reports/menu-autopilot/YYYY-MM-DD-security-review.md`

### Structured JSON
Write to `~/Projects/agent-reports/menu-autopilot/YYYY-MM-DD-security-review.json`:
```json
{
  "meta": { "agent": "security-review", "project": "menu-autopilot", "date": "YYYY-MM-DD", "status": "completed" },
  "findings": [{ "id": "ma-sec-YYYY-MM-DD-001", "severity": "", "title": "", "description": "", "files": [], "suggestedFix": "", "effort": "", "status": "pending" }],
  "summary": { "total": 0, "high": 0, "medium": 0, "low": 0 }
}
```

**CRITICAL**: Finding IDs MUST follow format `ma-sec-YYYY-MM-DD-NNN` (e.g., `ma-sec-2026-02-03-001`). IDs must be globally unique.
### Task List
Create `~/.claude/tasks/menu-autopilot-security-YYYY-MM-DD.md`

### Completion
When done, output: REVIEW_COMPLETE
