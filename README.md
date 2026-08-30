# Dynamify

[![CI](https://github.com/esketit1227/Dynamify/actions/workflows/ci.yml/badge.svg)](https://github.com/esketit1227/Dynamify/actions/workflows/ci.yml)

An AI-powered personalization layer that reads and understands an existing
website, then dynamically adapts its copy, images, CTAs, and other content to
make the experience more relevant to every visitor — **without changing the
site's design, layout, or branding.** One page, one URL, per-visitor content.

A company connects its existing site. Dynamify crawls it, builds a real
understanding of what it sells and who it's for, and lets the company target
segments of visitors with AI-generated (or hand-written) alternative content
for specific elements — headline, subhead, CTA, testimonial, image. Every
change is approval-gated, boundary-controlled (never touches logo/legal/
pricing unless explicitly allowed), and reversible. If anything fails, the
visitor sees the real, unmodified site — never a broken one.

Full product vision: [`docs/product-spec.md`](docs/product-spec.md). Current
phase and what's actually shipped vs. planned: [`docs/roadmap.md`](docs/roadmap.md).
Open architectural/legal questions that haven't been resolved: [`docs/decisions.md`](docs/decisions.md).
Last verified-clean commit, with the exact commands and results:
[`docs/baseline.md`](docs/baseline.md).

## Status

The core product loop works end to end and has been exercised against real
seeded sites: connect → crawl → understand → target an audience → generate or
write content → approve → serve it live via the embed script → measure the
lift against a true holdout control group.

CI (`.github/workflows/ci.yml`) runs typecheck/lint/test/build against a
real Postgres service container on every push and PR. `/privacy` and
`/terms` exist as real, linked pages with a structurally-real outline —
placeholder legal language, not yet reviewed by counsel (each page says so,
prominently). Transactional email has one swappable interface
(`src/lib/email/`) wired into password reset today — set `RESEND_API_KEY`
and it's live, no code changes.

**Not yet built:** billing/payment collection, multi-seat team accounts,
actual legal review of the Privacy/Terms placeholder text, and production
infrastructure (no host or monitoring configured yet — CI exists, deploys
don't). The ecommerce platform adapters and conversational agent described
in `docs/` are specification/foundation only — see those docs' own status
lines before building against them.

## Stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript (strict mode)
- **Database:** PostgreSQL via Prisma 7 (`@prisma/adapter-pg`)
- **Auth:** Session-based, `httpOnly` cookies, `argon2` password hashing
- **Validation:** Zod at every trust boundary (API input, webhooks, AI output, env vars)
- **AI:** Anthropic (copy/audience generation) + OpenAI (image generation) — both optional; every AI-dependent feature has a real, non-AI heuristic fallback, not a broken state
- **Testing:** Vitest (unit + integration, against a real Postgres test database), Playwright (e2e)
- **Styling:** Tailwind CSS v4

## Architecture

The personalization engine lives at **`packages/sdk`** as a real workspace
package (`@dynamify/personalization-sdk`), not just application code — this
is deliberate. It's a **pure function**: `(VisitorContext, PageDefinition) =>
ResolvedPage`. No I/O, no database, no network, no `Date.now()` or
`Math.random()` — every non-deterministic input is injected by the caller.
That's what makes rule resolution (priority → specificity → default,
tie-broken deterministically) fully unit-testable in isolation and
extractable into its own SDK without a rewrite.

Everything else in `src/` is the application around that engine:

```
packages/sdk/            The pure personalization engine (see above)
src/app/                 Next.js routes — (auth), (dashboard), api/
src/components/          React components, organized by feature area
src/lib/                 Business logic — services, one folder per domain
  auth/                  Sessions, passwords, org access control
  sites/                 Crawl, understand, personalize, boundaries
  embed/                 What the public embed script's API calls run
  visitors/              Visitor identity, sessions, DSR export/delete
  recommendations/       Segment discovery + auto-generated full experiences
  analytics/             Generic-vs-personalized, causal lift (holdout test)
  ai/                    Anthropic/OpenAI clients and brand-safety checks
  security/              SSRF guarding, encryption
public/dynamify-embed.js The client-side script a customer installs on their
                         site — finds the matched DOM node, verifies its
                         content hasn't drifted since the crawl, swaps it
prisma/                  Schema + migrations
docs/                    Product spec, roadmap, and architectural decisions
```

Route handlers follow one shape: **authorize → validate → call service →
shape response.** Business logic never lives in a component or route handler
directly — it's always in `src/lib/`.

### A few things worth knowing before changing this codebase

- **Rule resolution order is fixed** (explicit priority → specificity →
  default) and ties are never broken by array or object-key order — see
  `packages/sdk/src/resolve.ts`.
- **Every personalizable element has a default.** If context is missing,
  rules throw, or anything fails, the default renders. A published page must
  never break because personalization failed.
- **Tenant isolation is server-side, per request, always from the session** —
  never from a client-supplied org id in the URL or body.
- **Content-drift verification runs on every single page view**, not cached
  between crawls — if the live DOM doesn't match what was crawled, that
  element is skipped, never force-swapped.
- The old "Dynamify hosts your page" architecture (`Page`/`Campaign`/
  `Component` models and everything built on them) was retired — see
  `docs/roadmap.md`'s 2026-08-26 and 2026-08-30 entries. The current
  architecture personalizes a customer's *existing* site in place; it
  doesn't host anything.

## Getting started

**Prerequisites:** Node 20+, pnpm, a local PostgreSQL instance.

```bash
pnpm install

# Create two databases (dev + test) and set their URLs in .env — see
# .env.example. At minimum you need:
#   DATABASE_URL="postgresql://user@localhost:5432/dynamify_dev"
#   TEST_DATABASE_URL="postgresql://user@localhost:5432/dynamify_test"

pnpm db:generate    # generate the Prisma client
pnpm db:migrate     # apply migrations to DATABASE_URL
pnpm dev            # http://localhost:3000
```

Everything works with zero API keys configured — AI features fall back to
real (not fake) heuristics, and IP enrichment simply stays off. Set these in
`.env` to enable the real integrations:

| Variable | Enables |
|---|---|
| `ANTHROPIC_API_KEY` | AI-generated copy, audience suggestions, brand-safety fact-checking |
| `OPENAI_API_KEY` | AI-generated images for eligible elements |
| `IPINFO_API_KEY` | IP → company enrichment (off per-site by default regardless) |
| `RESEND_API_KEY` | Transactional email — password reset today (see `src/lib/email/`). Unset means the reset link is generated but never delivered; the request still succeeds, silently. This is the only env var required to activate it — `EMAIL_FROM_ADDRESS` defaults to Resend's own sandbox sender |
| `PLATFORM_CREDENTIALS_ENCRYPTION_KEY` | Required before storing any ecommerce platform credential (`openssl rand -hex 32`) — the ecommerce integration itself is foundation-only, see `docs/ecommerce.md` |

## Commands

```bash
pnpm dev              # dev server
pnpm build            # production build
pnpm start            # run a production build

pnpm typecheck        # tsc --noEmit
pnpm lint             # eslint
pnpm test             # vitest — unit + integration, against TEST_DATABASE_URL
pnpm test:watch       # vitest in watch mode
pnpm test:e2e         # playwright, against a running dev server

pnpm db:migrate       # prisma migrate dev (DATABASE_URL)
pnpm db:generate      # regenerate the Prisma client after a schema change
pnpm db:test:migrate  # apply migrations to TEST_DATABASE_URL
```

Run `pnpm typecheck && pnpm lint && pnpm test && pnpm build` before
considering any change done — this is the same bar every change in this
repo's history has been held to.

## Testing philosophy

Integration tests run against a real Postgres database
(`TEST_DATABASE_URL`), not mocks — `tests/setup/env.ts` redirects
`DATABASE_URL` there before anything imports Prisma, specifically so a test
run can never touch dev data. Unit tests cover pure logic (the resolver,
brand-safety claim extraction, significance testing, SSRF guarding).
Cross-tenant isolation has its own dedicated test files — every new
resource type should get an equivalent case: org A must never be able to
read, list, or mutate org B's data by guessing or supplying its id directly.

## License

No license file yet. Treat this as proprietary/all-rights-reserved until
one is added.
