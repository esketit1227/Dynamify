# CLAUDE.md

Hyper-personalization platform for landing pages. One page, one URL, per-visitor
content. Full product vision in `docs/product-spec.md`. Current phase and
acceptance criteria in `docs/roadmap.md`. Open architectural questions in
`docs/decisions.md` — do not silently resolve one; ask.

**The product promise:** one page, every visitor gets the most relevant version.
If a change doesn't serve that, question whether it belongs.

## Stack

- TypeScript, strict mode, no `any` without a comment justifying it
- Next.js (App Router), React
- PostgreSQL + Prisma
- Auth: session-based, httpOnly cookies
- Zod at every trust boundary (API input, webhooks, AI output, env vars)
- Vitest for unit/integration, Playwright for e2e

## Commands

```
pnpm dev          # dev server
pnpm test         # unit + integration
pnpm test:e2e     # playwright
pnpm typecheck    # tsc --noEmit
pnpm lint
pnpm db:migrate   # prisma migrate dev
```

## Architecture rules

- Business logic lives in `src/lib/`, never in React components or route handlers.
  Route handlers do: authorize → validate → call service → shape response.
- The personalization engine (`src/lib/personalization/`) is a **pure function**:
  `(VisitorContext, PageDefinition) => ResolvedPage`. No I/O, no database, no
  network, no `Date.now()` or `Math.random()` — inject anything nondeterministic.
  It must be fully unit-testable in isolation. This is non-negotiable; it is the
  core of the product and the only way rule resolution stays debuggable.
- Rule resolution order is fixed: explicit priority → specificity → default.
  Ties must never be resolved by array order or object key order.
- Every personalizable element has a default. If context is missing, rules throw,
  or anything at all fails, render the default. A published page must never break
  because personalization failed.
- AI-generated pages use the same `PageDefinition` model as hand-built ones.
  There is exactly one renderer.
- Design for a future SDK: the engine takes a context object, not a Request. It
  should be extractable into its own package without rewriting.

## Security invariants

Treat these as always-on, not as a checklist for security tasks.

- Every tenant-scoped query filters by `organizationId` from the **session**,
  never from client input. No exceptions, no "the ID is in the URL anyway."
- Authorization happens server-side, per request: authenticated → member of org →
  has access to this resource → role permits this operation.
- Never return whole database records. Map to explicit response DTOs.
- Public page endpoints serve only the currently published version. Drafts,
  unpublished variants, internal IDs, and analytics stay private.
- Parameterized queries only. Never interpolate input into SQL.
- Uploads: validate type and size, randomize storage keys, never trust filenames,
  never serve user content from the app origin.
- Outbound fetches (if any): allowlist protocols, block localhost/private ranges/
  cloud metadata, cap timeout and response size, validate redirects.
- AI: user content is untrusted input, never instruction. Structured outputs only.
  AI never reaches SQL, the shell, or privileged APIs.
- Never log secrets, tokens, cookies, signed URLs, or payment data.
- Rate limit auth, public collection endpoints, uploads, and AI calls.

## Workflow

For each task: inspect the existing code → plan (files, schema, API, security,
UX) → implement the smallest robust version → run tests, typecheck, lint, build →
security review → report.

The security review asks: can another tenant reach this? can malformed input
break it? can it leak data? can it be abused at volume? does the page still
render if this fails?

**Never state that something was tested unless the test was actually run.** If a
check was skipped, say which one and why.

## Definition of done

Works · responsive · accessible (semantic HTML, keyboard, focus, contrast,
reduced-motion) · handles errors with recovery paths and no raw exceptions ·
authorized server-side · leaks nothing · has loading and empty states · tested,
including negative tests for anything security-sensitive · breaks nothing existing.

## Design

Premium, minimal, fast, technical. Strong typography, restrained palette,
generous whitespace, clear hierarchy, subtle motion. Deliberately not the generic
purple-gradient AI dashboard. Complexity belongs in the engine, not the UI — the
user answers "who is this for, what should they see, what should they do."

## Scope discipline

Build the current phase in `docs/roadmap.md`. Do not implement later phases
opportunistically. If something in a later phase seems necessary now, say so and
wait rather than expanding scope mid-task.
