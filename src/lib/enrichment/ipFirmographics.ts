import { isIPv4, isIPv6 } from "node:net";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isPrivateIp } from "@/lib/security/ssrfGuard";
import { env } from "@/lib/env";

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — see docs/decisions.md D5
const FETCH_TIMEOUT_MS = 3000;
const CLEANUP_PROBABILITY = 0.01;

// docs/visitor-data.md: "Resolve, use, discard; do not store raw IPs
// beyond what is needed for the lookup." The raw IP is used only to
// compute this hash and call the provider — never written to the
// database itself. Same primitive src/lib/auth/session.ts already uses
// for tokens, applied here for the same reason: a one-way digest that
// still lets a repeat visitor from the same IP hit the cache.
export function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

// Same opportunistic, probabilistic pattern as
// maybeCleanupExpiredBuckets (src/lib/auth/rateLimit.ts) — no cron
// scheduler exists in this app, so real deletion happens on the hot
// path instead of a scheduled job. This is what makes the 7-day TTL
// actually govern *deletion*, not just re-fetch gating (the gap that
// left raw IPs sitting in this table indefinitely before this fix).
function maybeCleanupExpiredCache(): void {
  if (Math.random() >= CLEANUP_PROBABILITY) return;
  const cutoff = new Date(Date.now() - CACHE_TTL_MS);
  prisma.$executeRaw`DELETE FROM "IpEnrichmentCache" WHERE "fetchedAt" < ${cutoff}`.catch(() => {});
}

// "AS15169 Google LLC" -> "Google LLC". ipinfo.io's basic lookup's `org`
// field is the one part of their API stable/documented enough to build
// against without a live key to verify against; their industry/employee-
// count data lives behind a different paid tier this doesn't attempt.
// Exported (pure, no I/O) so this parsing can be unit-tested directly
// without mocking env/fetch — see tests/unit/enrichment/ipFirmographics.test.ts.
export function parseOrgField(org: unknown): string | undefined {
  if (typeof org !== "string") return undefined;
  const trimmed = org.trim();
  if (/^AS\d+$/.test(trimmed)) return undefined; // ASN only, no company name at all
  const withoutAsn = trimmed.replace(/^AS\d+\s+/, "").trim();
  return withoutAsn.length > 0 ? withoutAsn : undefined;
}

// A well-formed, public (non-private/loopback/link-local) IP — the only
// shape enrichIp will ever act on. Exported (pure) for the same reason as
// parseOrgField above.
export function isEnrichableIp(ip: string): boolean {
  return (isIPv4(ip) || isIPv6(ip)) && !isPrivateIp(ip);
}

const ipinfoResponseSchema = z.object({ org: z.string().optional() });

async function fetchFromProvider(ip: string, apiKey: string): Promise<string | undefined> {
  try {
    // Deliberately plain fetch, not safeFetch (src/lib/security/ssrfGuard.ts):
    // that guard exists to stop an *attacker-controlled hostname* from
    // reaching an internal address. The hostname here is a fixed literal
    // (IPINFO_BASE_URL), never derived from request input — only the
    // already-validated-public `ip` varies in the path — so the threat
    // model safeFetch defends against doesn't apply, and making the base
    // URL overridable lets live verification point this at a local mock
    // server without weakening anything real (safeFetch would block
    // localhost outright, which is correct in production but would get in
    // the way of honestly testing this specific fixed-host call).
    const response = await fetch(
      `${env.IPINFO_BASE_URL}/${encodeURIComponent(ip)}/json?token=${encodeURIComponent(apiKey)}`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    );
    if (!response.ok) return undefined;

    const parsed = ipinfoResponseSchema.safeParse(await response.json());
    if (!parsed.success) return undefined;
    return parseOrgField(parsed.data.org);
  } catch {
    // Network failure, timeout, malformed JSON, whatever — enrichment is
    // never load-bearing, so any failure here just means "no company for
    // this visitor," the same as the field being genuinely unknown.
    return undefined;
  }
}

// Looks up a visitor's IP against a company database, cached for
// CACHE_TTL_MS so a repeat visit — or another visitor on the same
// corporate/office IP, the common case for B2B traffic — doesn't re-hit
// the provider. Never throws: a malformed/private IP, a missing API key,
// a provider outage, or an unparseable response are all just "no company,"
// the same "if anything fails, render the default" posture used
// everywhere else in this product (CLAUDE.md).
export async function enrichIp(ip: string): Promise<{ company: string } | null> {
  // Not configured: a no-op with no DB round-trip at all, same posture as
  // AiNotConfiguredError being thrown before any I/O happens — this is
  // never user-facing, so there's nothing to surface an error for.
  const apiKey = env.IPINFO_API_KEY;
  if (!apiKey) return null;
  if (!isEnrichableIp(ip)) return null;

  maybeCleanupExpiredCache();

  const ipHash = hashIp(ip);

  // No single-flight lock on a cold cache: the embed script's page-view
  // beacon and its elements fetch both call this independently on the
  // same page load, so a genuinely new IP can hit the provider twice
  // (both requests read the miss before either write lands) before it's
  // warm. Same class of single-process-only limitation already accepted
  // for rate limiting (src/lib/auth/rateLimit.ts) — real but low-cost
  // (only on a cold cache, at most one extra call, corrected by the very
  // next request) and not worth a distributed lock for this phase.
  const cached = await prisma.ipEnrichmentCache.findUnique({ where: { ipHash } });
  if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
    return cached.company ? { company: cached.company } : null;
  }

  const company = await fetchFromProvider(ip, apiKey);

  await prisma.ipEnrichmentCache.upsert({
    where: { ipHash },
    create: { ipHash, company },
    update: { company, fetchedAt: new Date() },
  });

  return company ? { company } : null;
}
