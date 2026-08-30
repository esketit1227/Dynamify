# Session 1 — Foundation

Paste into Claude Code after `/init`. Run in Plan Mode first (Shift+Tab), read
the plan, then approve. Do not paste the whole product spec as a prompt.

---

Read CLAUDE.md, docs/roadmap.md, and docs/decisions.md.

We are at Phase 0. Scope for this session is the foundation only — no page
editor, no personalization engine, no analytics.

Build:

1. Next.js App Router project, TypeScript strict, Tailwind, Vitest, Playwright,
   ESLint. Prisma with Postgres. Update the Commands section of CLAUDE.md with
   the real commands once they work.

2. The full Phase 0 Prisma schema listed in docs/roadmap.md. Define the whole
   core model now even though most tables stay unused this session — I want the
   relationships settled before migrations get expensive. Foreign keys,
   indexes on every tenant-scoping column, sensible constraints.

3. Session-based auth: signup, login, logout, password reset. httpOnly secure
   cookies, argon2 or bcrypt, rate limiting on login and password reset. On
   signup, create the user's Organization and Membership in one transaction.

4. A `requireOrgAccess(orgId)` helper that resolves the session, verifies
   membership, and returns the org context. Every tenant-scoped handler calls it.
   Show me the pattern applied to one real handler.

5. Dashboard shell: Overview, Pages, Audiences, Campaigns, Analytics,
   Integrations, Settings. Real routes, real empty states, no placeholder
   metrics and no fabricated numbers. Empty states should say what to do next.

6. Tests: signup and login work; a user in org A receives 403 or 404 — not
   data — when requesting a resource in org B.

Before writing code, give me the plan: files, schema, and where authorization
sits. Flag anything in docs/decisions.md this session would force a decision on
rather than deciding it yourself.

Stop when Phase 0 exit criteria pass. Then report what you built, what you ran,
what you did not run, and anything you're unsure about.
