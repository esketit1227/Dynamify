# Baseline — day zero of the launch push

This file is a pointer, not a log. It records the single most recent
verified-clean checkpoint — update it in place each time a new baseline is
established; don't append a history here (that's what `docs/roadmap.md` and
git history are for).

## Current baseline

| | |
|---|---|
| **Commit** | `bb8da09f9af3c15f6f80b4f9c2032d9ac723c52f` |
| **Branch** | `main` |
| **Verified** | 2026-08-30T11:53:37Z |
| **Working tree** | Clean — 0 uncommitted files at verification time |

This is the first commit in the repository's history with a real,
end-to-end launch-readiness pass behind it: the two known crash bugs
fixed, the superseded page-hosting model retired outright rather than
left half-alive, and the pricing page, README, CI, Privacy/Terms
scaffolding, and transactional email interface all built and verified —
see `docs/roadmap.md`'s 2026-08-30 entries for the detail behind each.
Everything below was run fresh against this exact commit, not inherited
from an earlier check.

## Verification run

```
$ pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Run as four separate commands (not chained) so each result below is
independently real, not just "the chain didn't stop":

| Check | Result | Time |
|---|---|---|
| `pnpm typecheck` (`tsc --noEmit`) | ✅ Pass, 0 errors | ~2.6s |
| `pnpm lint` (`eslint`) | ✅ Pass, 0 errors, 0 warnings | ~8.9s |
| `pnpm test` (`vitest run`) | ✅ 356/356 tests passed, 46/46 files | ~42s |
| `pnpm build` (`next build`) | ✅ Compiled successfully, 63 routes generated | ~6.9s |

**Not included in this baseline:** `pnpm test:e2e` (Playwright) — not run
as part of this pass; the four checks above are what the task asked for
and what CI (`.github/workflows/ci.yml`) runs on every push. E2E coverage
exists (`tests/e2e/`) but isn't part of this specific verified baseline.

## Environment this was run in

| | |
|---|---|
| Node | v22.12.0 |
| pnpm | 9.15.9 (pinned via `packageManager` in `package.json`) |
| Next.js | 16.3.3 |
| Prisma | 7.10.0 |
| TypeScript | ^5 |
| PostgreSQL | 16 (local) |

`pnpm test` ran against `TEST_DATABASE_URL` (see `tests/setup/env.ts` —
this is structurally guaranteed to never touch dev data), with all 21
committed migrations applied. `pnpm build` ran with no `RESEND_API_KEY`,
`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `IPINFO_API_KEY` set — every
optional integration was exercised in its "not configured" state, which
is the state this baseline is actually claiming works, not a best case
that assumes keys no one has set yet.

## How to reproduce this exact result

```bash
git checkout bb8da09f9af3c15f6f80b4f9c2032d9ac723c52f
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:migrate        # against DATABASE_URL
pnpm db:test:migrate   # against TEST_DATABASE_URL
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```
