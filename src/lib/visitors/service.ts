import { prisma } from "@/lib/db";
import { toSiteVisitorDTO, type SiteVisitorDTO } from "./dto";

export async function listSiteVisitors(
  organizationId: string,
  siteId?: string,
): Promise<SiteVisitorDTO[]> {
  const visitors = await prisma.siteVisitor.findMany({
    where: { organizationId, ...(siteId ? { siteId } : {}) },
    orderBy: { lastSeenAt: "desc" },
    include: {
      company: { select: { name: true, domain: true } },
      person: { select: { id: true } },
      sessions: { select: { _count: { select: { conversions: true } } } },
    },
  });
  return visitors.map(toSiteVisitorDTO);
}

// Company-tier identity (docs/visitor-data.md) — dedupes visitors at the
// same company into one row instead of a bare repeated string. Domain is
// the doc's stated natural key, but the one real provider configured
// today (ipinfo.io's basic tier, src/lib/enrichment/ipFirmographics.ts)
// only ever returns a company *name*, never a domain — so this falls
// back to name-based dedup, which is a plain query rather than a
// DB-enforced constraint (Postgres can't express "unique on domain OR
// name" in one index). A small race window on a brand-new company name
// under concurrent first-sightings is accepted, same class of trade-off
// already documented for the rate limiter's fixed-window boundary.
export async function findOrCreateCompany(
  organizationId: string,
  input: { domain?: string; name?: string },
): Promise<string | null> {
  const domain = input.domain?.trim() || undefined;
  const name = input.name?.trim() || undefined;

  if (domain) {
    const company = await prisma.company.upsert({
      where: { organizationId_domain: { organizationId, domain } },
      create: { organizationId, domain, name },
      update: name ? { name } : {},
    });
    return company.id;
  }

  if (!name) return null;

  const existing = await prisma.company.findFirst({
    where: { organizationId, domain: null, name },
  });
  if (existing) return existing.id;

  const created = await prisma.company.create({ data: { organizationId, name } });
  return created.id;
}

// docs/visitor-data.md: "Always (no consent needed)... Country and
// region from edge geo headers (never a third-party geo API on the
// critical path)." Tries the conventions of common edge platforms;
// returns undefined when none are present, which is always true in
// local dev (no real edge/CDN layer) — the same honest, no-real-key gap
// already accepted for OpenAI images and ipinfo.io in this environment.
// Pure given a Headers-like input, so it's directly unit-testable.
export function geoFromHeaders(headers: {
  get(name: string): string | null;
}): { country?: string; region?: string } {
  const country =
    headers.get("x-vercel-ip-country") ?? headers.get("cf-ipcountry") ?? undefined;
  const region = headers.get("x-vercel-ip-country-region") ?? undefined;
  return {
    country: country || undefined,
    region: region || undefined,
  };
}

// A new VisitorSession starts once this many minutes pass with no event
// for the same visitor — a standard, defensible single constant (not a
// per-org config surface; the doc doesn't ask for one here, unlike the
// retention windows it explicitly does).
export const SESSION_GAP_MINUTES = 30;

// Pure — exported for direct unit testing without a database.
export function isNewSessionBoundary(lastEventAt: Date, now: Date): boolean {
  return now.getTime() - lastEventAt.getTime() > SESSION_GAP_MINUTES * 60 * 1000;
}

export type SessionContext = {
  referrer?: string;
  utm?: { source?: string; medium?: string; campaign?: string; term?: string; content?: string };
  device?: string;
  geo?: { country?: string; region?: string };
};

// The most recent VisitorSession row for this visitor, if its
// lastEventAt is still within SESSION_GAP_MINUTES of now, *is* the open
// session — updated in place. Otherwise a new one starts. No background
// job ever "closes" a session; the gap check at write time is the whole
// mechanism (see the VisitorSession model's own comment in schema.prisma).
export async function upsertSession(
  organizationId: string,
  visitorId: string,
  context: SessionContext,
  eventType: "PAGE_VIEW" | "CTA_CLICK",
): Promise<string> {
  const now = new Date();
  const latest = await prisma.visitorSession.findFirst({
    where: { visitorId },
    orderBy: { lastEventAt: "desc" },
  });

  const pageViewIncrement = eventType === "PAGE_VIEW" ? 1 : 0;
  const ctaClickIncrement = eventType === "CTA_CLICK" ? 1 : 0;

  if (latest && !isNewSessionBoundary(latest.lastEventAt, now)) {
    const updated = await prisma.visitorSession.update({
      where: { id: latest.id },
      data: {
        lastEventAt: now,
        pageViewCount: { increment: pageViewIncrement },
        ctaClickCount: { increment: ctaClickIncrement },
        // A later event's device/geo can refine what an earlier one in
        // the same session didn't have (e.g. geo present on event 2 but
        // not event 1) — never overwrite a known value with an unknown
        // one.
        device: context.device ?? latest.device,
        geoCountry: context.geo?.country ?? latest.geoCountry,
        geoRegion: context.geo?.region ?? latest.geoRegion,
      },
    });
    return updated.id;
  }

  const created = await prisma.visitorSession.create({
    data: {
      organizationId,
      visitorId,
      startedAt: now,
      lastEventAt: now,
      referrer: context.referrer,
      utmSource: context.utm?.source,
      utmMedium: context.utm?.medium,
      utmCampaign: context.utm?.campaign,
      utmTerm: context.utm?.term,
      utmContent: context.utm?.content,
      device: context.device,
      geoCountry: context.geo?.country,
      geoRegion: context.geo?.region,
      pageViewCount: pageViewIncrement,
      ctaClickCount: ctaClickIncrement,
    },
  });
  return created.id;
}

export type MatchedImpression = { audienceId: string; ruleId: string; elementVariantId: string };

// docs/visitor-data.md: "what each visitor was actually shown... the
// most valuable data we hold." One row per personalized component.
export async function recordImpressions(
  organizationId: string,
  sessionId: string,
  crawledPageId: string,
  impressions: MatchedImpression[],
): Promise<void> {
  if (impressions.length === 0) return;
  await prisma.impression.createMany({
    data: impressions.map((imp) => ({
      organizationId,
      sessionId,
      crawledPageId,
      audienceId: imp.audienceId,
      ruleId: imp.ruleId,
      elementVariantId: imp.elementVariantId,
    })),
  });
}

// A real, stored, timestamped conversion fact, replacing the previous
// derived-at-read-time "ctaClickCount > 0" boolean. goalId stays null —
// no configurable-goal concept exists in this product yet
// (docs/roadmap.md Phase 6 explicitly deferred one, on purpose).
export async function createConversion(
  organizationId: string,
  sessionId: string,
  siteEventId: string,
): Promise<void> {
  await prisma.conversion.create({
    data: { organizationId, sessionId, siteEventId },
  });
}

const CLEANUP_PROBABILITY = 0.01;

// docs/visitor-data.md Retention — enforced per-org against
// Organization.rawEventRetentionDays/sessionRetentionDays/
// visitorRetentionDays, using the same opportunistic, probabilistic,
// unawaited, hot-path-triggered pattern already established for
// RateLimitBucket (src/lib/auth/rateLimit.ts) and IpEnrichmentCache
// (src/lib/enrichment/ipFirmographics.ts) — no cron scheduler exists in
// this app. Deletes oldest-first data past each configured window:
// SiteEvent past rawEventRetentionDays, VisitorSession past
// sessionRetentionDays (cascades to its Impressions/Conversions),
// SiteVisitor past visitorRetentionDays since last activity (cascades
// to its events/sessions).
export function maybeCleanupOrgVisitorData(
  organizationId: string,
  windows: { rawEventRetentionDays: number; sessionRetentionDays: number; visitorRetentionDays: number },
): void {
  if (Math.random() >= CLEANUP_PROBABILITY) return;

  const now = Date.now();
  const eventCutoff = new Date(now - windows.rawEventRetentionDays * 24 * 60 * 60 * 1000);
  const sessionCutoff = new Date(now - windows.sessionRetentionDays * 24 * 60 * 60 * 1000);
  const visitorCutoff = new Date(now - windows.visitorRetentionDays * 24 * 60 * 60 * 1000);

  prisma.siteEvent
    .deleteMany({ where: { organizationId, createdAt: { lt: eventCutoff } } })
    .catch(() => {});
  prisma.visitorSession
    .deleteMany({ where: { organizationId, lastEventAt: { lt: sessionCutoff } } })
    .catch(() => {});
  prisma.siteVisitor
    .deleteMany({ where: { organizationId, lastSeenAt: { lt: visitorCutoff } } })
    .catch(() => {});
}
