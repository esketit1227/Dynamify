import { randomUUID } from "node:crypto";
import { resolve } from "@dynamify/personalization-sdk";
import type { ResolvedPage, VisitorContext } from "@dynamify/personalization-sdk";
import { prisma } from "@/lib/db";
import { normalizeUrl } from "@/lib/sites/crawler";
import { getLiveViewDefinition } from "@/lib/liveview/service";
import { enrichIp } from "@/lib/enrichment/ipFirmographics";
import { computeIntentScore, stageForIntent } from "@/lib/visitors/inferProfile";
import { shouldHoldOut } from "@/lib/experiments/holdout";
import {
  findOrCreateCompany,
  upsertSession,
  recordImpressions,
  createConversion,
  maybeCleanupOrgVisitorData,
} from "@/lib/visitors/service";

export type EmbedElement = {
  id: string;
  selector: string;
  elementType: string;
  currentContent: string;
  // Present only when `context` was given and an APPROVED rule matched
  // this visitor for this element — the runtime swap payload (Phase 3).
  // Absent means "nothing to change here for this visitor."
  personalizedContent?: string;
};

// docs/visitor-data.md's Consent architecture: "an input to the engine,
// not a wrapper around it." `necessary` is always true by construction
// (this product has no non-essential *required* cookie); `analytics`
// gates whether any SiteEvent/VisitorSession/Impression/Conversion row
// is written at all for this load; `personalization` gates whether
// IP-enrichment/visitor-tracking attributes are ever built into the
// VisitorContext resolve() sees. Defaults to necessary-only — the doc's
// stated default posture before any consent signal — so a caller that
// sends nothing degrades safely rather than opting a visitor in by
// omission.
export type ConsentState = { necessary: boolean; analytics: boolean; personalization: boolean };
export const DEFAULT_CONSENT: ConsentState = { necessary: true, analytics: false, personalization: false };

export type GeoHeaders = { country?: string; region?: string };

// Mirrors the embed script's own utmMap (public/dynamify-embed.js) — UTM
// tags are attribution metadata a real visitor's URL carries, never part
// of what the crawler saw or a page's identity, so they must not stop a
// visitor's URL from matching its crawled page. Unlike UTM params, other
// query strings (e.g. pagination) legitimately distinguish crawled pages
// (see normalizeUrl's own tests) and are deliberately left alone here.
const TRACKING_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];

function stripTrackingParams(rawUrl: string): string {
  const url = new URL(rawUrl);
  for (const param of TRACKING_PARAMS) url.searchParams.delete(param);
  return url.toString();
}

// Shared by every embed endpoint that needs "which crawled page is this
// visitor looking at right now" — the `siteId` is the public, embedded
// identifier (same trust model as a Stripe publishable key: high-entropy
// cuid, and everything it unlocks is the customer's own already-public
// page content). Only READY sites, only the exact page matching the
// visitor's current URL (normalized the same way the crawler dedupes
// trailing-slash variants, tracking params stripped first). Never throws —
// an unknown site, a not-yet-ready site, or a URL we never crawled all
// just mean "nothing found," the same as any other failure path in this
// product.
async function findCrawledPage(siteId: string, rawUrl: string): Promise<{
  id: string;
  organizationId: string;
  title: string | null;
  ipEnrichmentEnabled: boolean;
  visitorTrackingEnabled: boolean;
  holdbackPercent: number;
  rawEventRetentionDays: number;
  sessionRetentionDays: number;
  visitorRetentionDays: number;
} | null> {
  let url: string;
  try {
    url = normalizeUrl(stripTrackingParams(rawUrl));
  } catch {
    return null;
  }

  const page = await prisma.crawledPage.findFirst({
    where: { siteId, url, site: { status: "READY" } },
    select: {
      id: true,
      organizationId: true,
      title: true,
      site: {
        select: {
          ipEnrichmentEnabled: true,
          visitorTrackingEnabled: true,
          holdbackPercent: true,
          organization: {
            select: { rawEventRetentionDays: true, sessionRetentionDays: true, visitorRetentionDays: true },
          },
        },
      },
    },
  });
  if (!page) return null;

  return {
    id: page.id,
    organizationId: page.organizationId,
    title: page.title,
    ipEnrichmentEnabled: page.site.ipEnrichmentEnabled,
    visitorTrackingEnabled: page.site.visitorTrackingEnabled,
    holdbackPercent: page.site.holdbackPercent,
    rawEventRetentionDays: page.site.organization.rawEventRetentionDays,
    sessionRetentionDays: page.site.organization.sessionRetentionDays,
    visitorRetentionDays: page.site.organization.visitorRetentionDays,
  };
}

// Shared by getEmbedElements and recordSiteEvent so the same page load
// always gets the same answer without either endpoint trusting the
// other's word for it — see src/lib/experiments/holdout.ts. `seed` is the
// visitor's stable visitorKey when tracked, else the embed script's
// per-load loadToken; with neither, holdout never applies (no stable
// identity to assign consistently means no experiment for this load).
function computeHeldOut(holdbackPercent: number, wouldPersonalize: boolean, seed: string | undefined): boolean {
  if (!wouldPersonalize || !seed) return false;
  return shouldHoldOut(seed, holdbackPercent);
}

// Real, re-identifiable visitor tracking — deliberately separate from
// (and off by default relative to) the anonymous SiteEvent model above.
// See docs/decisions.md D5 (widened) and D7 for why these are two
// different postures living side by side rather than one replacing the
// other. Only ever called when the site has explicitly opted in, the
// visitor gave analytics consent, and a visitorKey (the embed script's
// dynamify_vid cookie value) was actually sent — never inferred, never
// defaulted on.
//
// Runs inside a transaction that locks the visitor's row (SELECT ...
// FOR UPDATE) before computing the new counts — a real bug found via live
// verification, not a hypothetical: two near-simultaneous events for the
// same visitor (e.g. two tabs) each read the same "existing" state and
// both wrote pageViewCount+1, losing one increment. Same class of
// read-then-write race as the pre-fix in-memory rate limiter; the fix
// here is the DB-lock equivalent of that one's atomic counter.
async function upsertSiteVisitor(
  organizationId: string,
  siteId: string,
  visitorKey: string,
  crawledPageId: string,
  pageTitle: string | null,
  context: VisitorContext,
  eventType: "PAGE_VIEW" | "CTA_CLICK",
  consent: ConsentState,
): Promise<string> {
  // Resolved before the row lock below — findOrCreateCompany's own
  // queries don't depend on the visitor row, so there's no reason to
  // hold that lock open while they run.
  const enrichedCompanyName =
    typeof context.attributes?.company === "string" ? context.attributes.company : undefined;
  const resolvedCompanyId = enrichedCompanyName
    ? await findOrCreateCompany(organizationId, { name: enrichedCompanyName })
    : undefined;

  return prisma.$transaction(async (tx) => {
    // Ensures a row exists via a real Postgres UPSERT (raw, not
    // tx.siteVisitor.upsert() — that compiles to a plain INSERT here and
    // throws a unique-constraint error under concurrent callers instead of
    // taking the ON CONFLICT path). id/lastSeenAt are Prisma-client-side
    // defaults (cuid()/@updatedAt), not DB defaults, so raw SQL has to
    // supply both explicitly.
    await tx.$executeRaw`
      INSERT INTO "SiteVisitor" ("id", "organizationId", "siteId", "visitorKey", "lastSeenAt")
      VALUES (${randomUUID()}, ${organizationId}, ${siteId}, ${visitorKey}, ${new Date()})
      ON CONFLICT ("siteId", "visitorKey") DO NOTHING
    `;

    // Locks that row for the rest of this transaction — a concurrent call
    // for the same visitor blocks here until this transaction commits,
    // then reads the state *this* call just wrote. That serialization is
    // the actual fix; everything below is unchanged from a plain read.
    const [existing] = await tx.$queryRaw<
      { visitedPageIds: unknown; pageViewCount: number; ctaClickCount: number; companyId: string | null; interest: string | null }[]
    >`SELECT "visitedPageIds", "pageViewCount", "ctaClickCount", "companyId", "interest" FROM "SiteVisitor" WHERE "siteId" = ${siteId} AND "visitorKey" = ${visitorKey} FOR UPDATE`;

    const previouslyVisited = Array.isArray(existing.visitedPageIds)
      ? (existing.visitedPageIds as unknown[]).filter((v): v is string => typeof v === "string")
      : [];
    const visitedPageIds = previouslyVisited.includes(crawledPageId)
      ? previouslyVisited
      : [...previouslyVisited, crawledPageId];

    const pageViewCount = existing.pageViewCount + (eventType === "PAGE_VIEW" ? 1 : 0);
    const ctaClickCount = existing.ctaClickCount + (eventType === "CTA_CLICK" ? 1 : 0);
    const distinctPages = visitedPageIds.length;
    const intentScore = computeIntentScore({ pageViewCount, ctaClickCount, distinctPages });
    const stage = stageForIntent(intentScore);

    const companyId = resolvedCompanyId ?? existing.companyId ?? undefined;
    // Prefers an explicit UTM campaign (marketer-declared "why they're
    // here") over the current page title (what they happen to be looking
    // at) — both are real signals already captured per event, just
    // aggregated onto the visitor row instead of computed fresh.
    const interest = context.utm?.campaign ?? pageTitle ?? existing.interest ?? undefined;

    const visitor = await tx.siteVisitor.update({
      where: { siteId_visitorKey: { siteId, visitorKey } },
      data: {
        pageViewCount,
        ctaClickCount,
        visitedPageIds,
        distinctPages,
        companyId,
        lastDevice: context.device,
        interest,
        intentScore,
        stage,
        // The visitor's most recently reported consent state — this can
        // legitimately change visit to visit (a CMP re-prompting, a
        // visitor changing their mind), so "most recent" is the
        // meaningful thing to persist, not "first ever."
        consentState: consent,
      },
    });

    return visitor.id;
  });
}

// Phase 6 (docs/roadmap.md): the one place a visitor's context gets
// enriched before resolve() ever sees it. Three independent sources feed
// the same context: IP-based company enrichment and the visitor's own
// real, accumulated intent/stage both require `personalization` consent
// (docs/visitor-data.md's engine-input consent model) in addition to
// their own site-level opt-in; edge geo (country/region) does not — it's
// in the doc's "Always (no consent needed)" bucket. Each is gated
// independently; a site/visitor can have any combination on.
//
// Unconditionally strips whatever `attributes` the client sent — a real
// gap found while building this: visitorContextSchema (shared with
// trusted internal callers like Live View simulation) is also what the
// public events route validates against, so a raw request could already
// set e.g. attributes.buyingIntent itself and have it matched against
// audience rules. The embed script never sends attributes (it only
// detects device/referrer/UTM), so nothing legitimate is lost — only a
// spoofing path closes. `attributes` on the public embed endpoints comes
// exclusively from what the server computes here, never from the client.
async function buildEffectiveContext(
  context: VisitorContext | undefined,
  visitorIp: string | undefined,
  ipEnrichmentEnabled: boolean,
  siteId: string,
  visitorTrackingEnabled: boolean,
  visitorKey: string | undefined,
  consent: ConsentState,
  geo: GeoHeaders,
): Promise<{
  context: VisitorContext | undefined;
  enrichmentAttempted: boolean;
  visitorLookupAttempted: boolean;
}> {
  const base: VisitorContext | undefined = context ? { ...context, attributes: undefined } : undefined;

  let attributes: NonNullable<VisitorContext["attributes"]> | undefined;
  let enrichmentAttempted = false;
  let visitorLookupAttempted = false;

  if (ipEnrichmentEnabled && consent.personalization && visitorIp) {
    enrichmentAttempted = true;
    const enriched = await enrichIp(visitorIp);
    if (enriched) attributes = { ...attributes, company: enriched.company };
  }

  // A brand-new visitor (no prior row) or a stale/unknown cookie value
  // just means "nothing to add" — same graceful-miss posture as a failed
  // IP lookup above, never a reason to fail the whole request.
  if (visitorTrackingEnabled && consent.personalization && visitorKey) {
    visitorLookupAttempted = true;
    const visitor = await prisma.siteVisitor.findUnique({
      where: { siteId_visitorKey: { siteId, visitorKey } },
      select: { stage: true, intentScore: true },
    });
    if (visitor) attributes = { ...attributes, stage: visitor.stage, intentScore: visitor.intentScore };
  }

  // Always-capture tier (docs/visitor-data.md) — no consent needed,
  // never gated on ipEnrichmentEnabled/visitorTrackingEnabled either;
  // this is just what the request's own edge headers say.
  const geoContext = geo.country || geo.region ? { country: geo.country, region: geo.region } : undefined;

  const mergedContext: VisitorContext | undefined =
    attributes || geoContext
      ? { ...(base ?? {}), ...(attributes ? { attributes } : {}), ...(geoContext ? { geo: geoContext } : {}) }
      : base;

  return { context: mergedContext, enrichmentAttempted, visitorLookupAttempted };
}

export type EmbedElementsResult = {
  elements: EmbedElement[];
  // False whenever the response could vary by the visitor's IP (Phase 6
  // enrichment), their own tracked behavior (real intent/stage,
  // behavioral targeting), or the site running a holdout experiment —
  // any of these means the URL alone (unlike device/UTM/referrer, which
  // are already part of the query string) no longer determines the
  // response, so the caller must not send a shared-cache header.
  cacheable: boolean;
  // Tells the embed script whether it should set/read the dynamify_vid
  // cookie at all — the cookie is only ever set when the *site* has
  // opted in, never by default, and this is how the client-side script
  // learns that without a second round trip.
  visitorTrackingEnabled: boolean;
};

// `context`, when given, runs the exact same resolve() pipeline Live View
// and the dashboard preview already use (docs/roadmap.md Phase 3 — "the
// script swaps approved variant text into the verified DOM node") — no new
// resolution logic, just a new caller of the one that already exists.
// `visitorKey`, when the site has tracking on, lets that pipeline see the
// visitor's own real accumulated intent/stage as `attributes.stage`/
// `attributes.intentScore` — behavioral targeting, not just observation.
// `loadToken` (a fresh id the embed script mints per page load, only used
// when there's no visitorKey) is the holdout seed for anonymous traffic —
// see computeHeldOut/src/lib/experiments/holdout.ts. When a visit is held
// out, this function still resolves normally internally but returns only
// default content — the visitor never learns they're in a control group.
export async function getEmbedElements(
  siteId: string,
  rawUrl: string,
  context?: VisitorContext,
  visitorIp?: string,
  visitorKey?: string,
  loadToken?: string,
  consent: ConsentState = DEFAULT_CONSENT,
  geo: GeoHeaders = {},
): Promise<EmbedElementsResult> {
  const page = await findCrawledPage(siteId, rawUrl);
  if (!page) return { elements: [], cacheable: true, visitorTrackingEnabled: false };

  const elements = await prisma.contentElement.findMany({
    where: { crawledPageId: page.id },
    select: { id: true, selector: true, elementType: true, currentContent: true },
    orderBy: { order: "asc" },
  });

  const {
    context: effectiveContext,
    enrichmentAttempted,
    visitorLookupAttempted,
  } = await buildEffectiveContext(
    context,
    visitorIp,
    page.ipEnrichmentEnabled,
    siteId,
    page.visitorTrackingEnabled,
    visitorKey,
    consent,
    geo,
  );
  // Once a site is running any holdout experiment, nothing on it is
  // cacheable — a shared cache can't know which visitor's coin flip
  // produced a given response, so a cached "personalized" response could
  // silently leak to a visitor who should've been held out. Simpler and
  // safer than tracking per-request whether holdout actually fired.
  const cacheable = !enrichmentAttempted && !visitorLookupAttempted && page.holdbackPercent === 0;

  if (!effectiveContext) {
    return { elements, cacheable, visitorTrackingEnabled: page.visitorTrackingEnabled };
  }

  const definition = await getLiveViewDefinition(page.organizationId, page.id);
  const resolved = resolve(effectiveContext, definition);

  const seed = visitorKey ?? loadToken;
  const heldOut = computeHeldOut(page.holdbackPercent, wasPersonalized(resolved), seed);

  const personalized = new Map<string, string>();
  if (!heldOut) {
    for (const component of resolved.components) {
      if (!component.matchedVariantId) continue;
      const text = (component.content as { text?: unknown }).text;
      if (typeof text === "string") personalized.set(component.id, text);
    }
  }

  const elementsWithPersonalization = elements.map((el) => {
    const personalizedContent = personalized.get(el.id);
    return personalizedContent === undefined ? el : { ...el, personalizedContent };
  });

  return { elements: elementsWithPersonalization, cacheable, visitorTrackingEnabled: page.visitorTrackingEnabled };
}

// D7 (docs/decisions.md): whether *this specific rendering* was
// personalized, computed once at record time so it becomes an immutable
// fact about what the visitor actually saw — never re-derived later
// against whatever the audience/rule state happens to be by report time.
// No `contentElementId` (a PAGE_VIEW) means "was anything on this page
// personalized for this visitor"; with one (a CTA_CLICK) means "was that
// specific element personalized for this visitor."
export function wasPersonalized(resolved: ResolvedPage, contentElementId?: string): boolean {
  if (contentElementId === undefined) {
    return resolved.components.some((c) => c.matchedVariantId !== undefined);
  }
  const component = resolved.components.find((c) => c.id === contentElementId);
  return component?.matchedVariantId !== undefined;
}

// Phase 5 (docs/roadmap.md): the raw material for traffic/segment
// analysis and (Phase 6) generic-vs-personalized conversion reporting —
// one anonymous row per page view or CTA click, with whatever context the
// script detected. Anonymous by default (D5/D7, docs/decisions.md) —
// this base SiteEvent write is always attempted regardless of consent:
// docs/visitor-data.md's own "Always (no consent needed)" bucket
// explicitly lists page URL/UTM/device/geo/timestamp *and* "resolved
// audience, matched rule ID, variant ID served" as strictly-necessary,
// non-cross-site data, since nothing here is tied to a persistent
// identity. `visitorKey` (the embed script's dynamify_vid cookie) is a
// different story — see below.
//
// docs/visitor-data.md's Consent architecture: `consent.analytics`
// specifically gates the doc's "With consent" bucket — a *persistent*
// visitor ID, session history, prior conversions — not the anonymous
// event above. So `visitorKey` is only ever honored (SiteVisitor/
// VisitorSession/Impression/Conversion written) when the site has
// separately opted into real visitor tracking (`Site.visitorTrackingEnabled`,
// D5 widened) *and* the visitor has given analytics consent; otherwise
// it's ignored entirely and only the anonymous row is written.
// `personalization` consent (handled inside buildEffectiveContext) gates
// a third, independent thing: whether known attributes are *used* to
// decide what to show. Silently does nothing at all for an unknown/
// not-ready site or never-crawled URL, same posture as getEmbedElements.
export async function recordSiteEvent(
  siteId: string,
  rawUrl: string,
  context: VisitorContext,
  visitorIp?: string,
  options?: { type: "CTA_CLICK"; contentElementId: string },
  visitorKey?: string,
  loadToken?: string,
  consent: ConsentState = DEFAULT_CONSENT,
  geo: GeoHeaders = {},
): Promise<void> {
  const page = await findCrawledPage(siteId, rawUrl);
  if (!page) return;

  maybeCleanupOrgVisitorData(page.organizationId, {
    rawEventRetentionDays: page.rawEventRetentionDays,
    sessionRetentionDays: page.sessionRetentionDays,
    visitorRetentionDays: page.visitorRetentionDays,
  });

  // Same effective context — including attributes.stage/intentScore when
  // applicable — that getEmbedElements would have built for this same
  // visitor's matching request. Required for correctness, not just
  // consistency: `personalized` below (D7) must reflect whether the
  // content the visitor *actually saw* was personalized, and that
  // decision was made against this same attribute set.
  const { context: effectiveContext } = await buildEffectiveContext(
    context,
    visitorIp,
    page.ipEnrichmentEnabled,
    siteId,
    page.visitorTrackingEnabled,
    visitorKey,
    consent,
    geo,
  );

  const definition = await getLiveViewDefinition(page.organizationId, page.id);
  const resolved = resolve(effectiveContext ?? {}, definition);

  let contentElementId: string | undefined;
  if (options) {
    // The clicked element must actually be a member of *this* resolved
    // page — getLiveViewDefinition is scoped by page.organizationId, never
    // client input, so this is the tenant-isolation check for the one
    // place this public endpoint takes a client-supplied id: a made-up or
    // foreign-site id simply isn't found here, and the event is dropped
    // rather than recorded against the wrong site's analytics.
    if (!resolved.components.some((c) => c.id === options.contentElementId)) return;
    contentElementId = options.contentElementId;
  }

  let visitorId: string | undefined;
  if (page.visitorTrackingEnabled && consent.analytics && visitorKey) {
    visitorId = await upsertSiteVisitor(
      page.organizationId,
      siteId,
      visitorKey,
      page.id,
      page.title,
      effectiveContext ?? {},
      options?.type ?? "PAGE_VIEW",
      consent,
    );
  }

  // Independently recomputed from the same inputs computeHeldOut used in
  // getEmbedElements for this same visit — never trusted from the client,
  // just re-derived, so this row can only ever agree with what the
  // visitor actually saw.
  const wouldPersonalize = wasPersonalized(resolved, contentElementId);
  const seed = visitorKey ?? loadToken;
  const heldOut = computeHeldOut(page.holdbackPercent, wouldPersonalize, seed);

  const siteEvent = await prisma.siteEvent.create({
    data: {
      organizationId: page.organizationId,
      siteId,
      crawledPageId: page.id,
      contentElementId,
      visitorId,
      type: options?.type ?? "PAGE_VIEW",
      personalized: wouldPersonalize && !heldOut,
      heldOut,
      context: (effectiveContext ?? {}) as object,
    },
  });

  // VisitorSession/Impression/Conversion (docs/visitor-data.md) — only
  // ever written when this visit is actually tracked (a real SiteVisitor
  // exists for it); the anonymous SiteEvent above is recorded regardless,
  // same posture as before this feature.
  if (visitorId) {
    const sessionId = await upsertSession(
      page.organizationId,
      visitorId,
      {
        referrer: effectiveContext?.referrer,
        utm: effectiveContext?.utm,
        device: effectiveContext?.device,
        geo: effectiveContext?.geo,
      },
      options?.type ?? "PAGE_VIEW",
    );

    // Impressions represent content actually being *shown* — that only
    // happens on a PAGE_VIEW (when the page renders). A CTA_CLICK is an
    // interaction with content already on screen from that same page's
    // PAGE_VIEW, not a second showing of it; recording one here too
    // would double-count every impression on any page that also gets a
    // click, inflating "what was shown" without a second showing ever
    // happening.
    if (!heldOut && (options?.type ?? "PAGE_VIEW") === "PAGE_VIEW") {
      const impressions = resolved.components
        .filter((c) => c.matchedVariantId && c.matchedRuleId)
        .map((c) => {
          const rule = definition.components
            .find((comp) => comp.id === c.id)
            ?.personalizationRules.find((r) => r.id === c.matchedRuleId);
          return rule
            ? { audienceId: rule.audienceId, ruleId: rule.id, elementVariantId: c.matchedVariantId! }
            : undefined;
        })
        .filter((imp): imp is NonNullable<typeof imp> => imp !== undefined);
      await recordImpressions(page.organizationId, sessionId, page.id, impressions);
    }

    if (options?.type === "CTA_CLICK") {
      await createConversion(page.organizationId, sessionId, siteEvent.id);
    }
  }
}
