import { prisma } from "@/lib/db";

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterMs: number };

const CLEANUP_PROBABILITY = 0.01;

// Fires occasionally, never awaited — bounds RateLimitBucket's growth
// without a cron/background-job scheduler (none exists in this app).
// Never blocks or affects the rate-limit decision itself.
function maybeCleanupExpiredBuckets(): void {
  if (Math.random() >= CLEANUP_PROBABILITY) return;
  const cutoff = new Date(Date.now() - 60 * 60 * 1000);
  prisma.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "windowEnd" < ${cutoff}`.catch(() => {});
}

// DB-backed (Postgres, the existing connection — no new infrastructure)
// fixed-window counter: one row per (key, window) rather than one row
// per request. Replaces the original in-memory sliding-window log, which
// was single-process only and provided zero real protection in any
// multi-instance deployment — every phase since Phase 0 added more
// behind it (auth, both public embed endpoints, and now paid AI/
// enrichment endpoints where this is the only cost control).
//
// Trade-off, accepted: a fixed window allows up to ~2x the configured
// limit right at a window boundary (`limit` requests just before it
// rolls over, `limit` more just after). This is about abuse/cost
// control, not precise per-millisecond enforcement, and it's still a
// large improvement over no cross-instance protection at all.
//
// The INSERT ... ON CONFLICT below is one atomic statement — Postgres
// resolves it per row, so concurrent requests for the same key can't
// both read "under limit" and both proceed the way a separate
// read-then-write pair would allow. Parameterized (tagged template),
// never string-interpolated — CLAUDE.md's "parameterized queries only"
// matters more than usual here, since `key` is often built from
// client-influenced values (an IP, an email).
//
// Deliberately never compares against Postgres's own NOW(): `windowEnd`
// is a plain `TIMESTAMP` (no time zone), and NOW() returns `timestamptz`,
// so `"windowEnd" <= NOW()` forces an implicit cast that reinterprets the
// naive value through the session's time zone — caught live in this
// environment (session zone Europe/Helsinki, UTC+3) where it made every
// freshly-inserted, still-valid window register as already expired. Both
// sides of every comparison here are instead bound parameters computed
// in JS (`now`, `windowEnd`), which round-trip through the same
// (consistent, if naive) storage convention and compare correctly
// regardless of the session's time zone.
export async function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): Promise<RateLimitResult> {
  maybeCleanupExpiredBuckets();

  const now = new Date();
  const windowEnd = new Date(now.getTime() + windowMs);

  const rows = await prisma.$queryRaw<{ count: number; windowEnd: Date }[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "windowEnd")
    VALUES (${key}, 1, ${windowEnd})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitBucket"."windowEnd" <= ${now} THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "windowEnd" = CASE WHEN "RateLimitBucket"."windowEnd" <= ${now} THEN ${windowEnd} ELSE "RateLimitBucket"."windowEnd" END
    RETURNING "count", "windowEnd"
  `;

  const row = rows[0];
  if (row.count > limit) {
    return { allowed: false, retryAfterMs: Math.max(0, row.windowEnd.getTime() - now.getTime()) };
  }
  return { allowed: true };
}

export function clientIpFromRequest(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return "unknown";
}
