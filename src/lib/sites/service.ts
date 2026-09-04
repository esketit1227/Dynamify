import { after } from "next/server";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/auth/errors";
import { assertSafeExternalUrl, UnsafeUrlError } from "@/lib/security/ssrfGuard";
import { crawlSite, CrawlError, type CrawledPageResult } from "@/lib/sites/crawler";
import { understandSite, type WebsiteUnderstandingResult } from "@/lib/sites/understand";
import { classifyPageElements, buildHeuristicUnderstanding, deriveElementContent } from "@/lib/sites/autoClassify";
import { AiGenerationError, AiNotConfiguredError } from "@/lib/ai/errors";
import { toSiteDTO, toSiteDetailDTO, type SiteDTO, type SiteDetailDTO } from "@/lib/sites/dto";
import { seedDefaultAudiences } from "@/lib/audiences/service";
import type { Prisma, ContentSection, ContentElementType, UnderstandingMethod } from "@/generated/prisma/client";

export class SiteNotFoundError extends HttpError {
  constructor() {
    super(404, "Site not found");
  }
}

export async function listSites(organizationId: string): Promise<SiteDTO[]> {
  const sites = await prisma.site.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });
  return sites.map(toSiteDTO);
}

export async function getSite(organizationId: string, siteId: string): Promise<SiteDetailDTO> {
  const site = await prisma.site.findFirst({
    where: { id: siteId, organizationId },
    include: {
      understanding: true,
      pages: {
        include: {
          elements: {
            include: {
              personalizationRules: {
                include: { audience: { select: { name: true } }, elementVariant: true },
              },
            },
          },
        },
      },
    },
  });
  if (!site) throw new SiteNotFoundError();
  return toSiteDetailDTO(site);
}

// Deleting the Site row alone cascades through CrawledPage to
// ContentElement/SiteEvent/Recommendation/GeneratedExperience/etc. (all
// onDelete: Cascade in schema.prisma), but SiteVisitor has no relation
// back to Site at all — siteId there is a bare denormalized field, kept
// that way deliberately (docs/visitor-data.md's identity model doesn't
// hang visitor identity off the crawl). Left alone, removing a site would
// silently orphan its real visitor data instead of actually deleting it,
// which is the whole point of "remove this site." Deleted explicitly
// here first — that single delete then cascades through VisitorSession
// -> Impression/Conversion (same cascade deleteVisitorData in
// src/lib/visitors/dsr.ts relies on) — audit-logged for the same reason
// deleting a visitor's data is: this genuinely destroys visitor records,
// not just crawl/config state.
async function logSiteDeleteAudit(organizationId: string, actorUserId: string, siteId: string): Promise<void> {
  await prisma.auditLog
    .create({
      data: { organizationId, actorUserId, action: "site.delete", targetType: "Site", targetId: siteId },
    })
    .catch(() => {});
}

export async function deleteSite(organizationId: string, siteId: string, actorUserId: string): Promise<void> {
  const site = await prisma.site.findFirst({ where: { id: siteId, organizationId } });
  if (!site) throw new SiteNotFoundError();

  await prisma.$transaction([
    prisma.siteVisitor.deleteMany({ where: { siteId } }),
    prisma.site.delete({ where: { id: siteId } }),
  ]);
  await logSiteDeleteAudit(organizationId, actorUserId, siteId);
}

// Phase 6 (docs/roadmap.md): off by default (Site.ipEnrichmentEnabled) —
// this is the explicit, per-site opt-in that turns it on. "Nothing goes
// live unapproved," applied to enabling a new category of data collection
// instead of a content change.
export async function setIpEnrichmentEnabled(
  organizationId: string,
  siteId: string,
  enabled: boolean,
): Promise<SiteDTO> {
  const site = await prisma.site.findFirst({ where: { id: siteId, organizationId } });
  if (!site) throw new SiteNotFoundError();
  const updated = await prisma.site.update({ where: { id: siteId }, data: { ipEnrichmentEnabled: enabled } });
  return toSiteDTO(updated);
}

// Real, persistent visitor identity (Site.visitorTrackingEnabled) — off by
// default, same explicit-opt-in shape as setIpEnrichmentEnabled above. See
// docs/decisions.md D5 (widened) for the disclosure/consent caveat this
// still carries that no code path here resolves.
export async function setVisitorTrackingEnabled(
  organizationId: string,
  siteId: string,
  enabled: boolean,
): Promise<SiteDTO> {
  const site = await prisma.site.findFirst({ where: { id: siteId, organizationId } });
  if (!site) throw new SiteNotFoundError();
  const updated = await prisma.site.update({ where: { id: siteId }, data: { visitorTrackingEnabled: enabled } });
  return toSiteDTO(updated);
}

// A/B holdout (Site.holdbackPercent, docs/roadmap.md Hardening) — off by
// default (0), same explicit-opt-in shape as the two toggles above.
// Validation (0-50) already happened at the schema boundary
// (src/lib/validation/sites.ts); this just persists it.
export async function setHoldbackPercent(
  organizationId: string,
  siteId: string,
  holdbackPercent: number,
): Promise<SiteDTO> {
  const site = await prisma.site.findFirst({ where: { id: siteId, organizationId } });
  if (!site) throw new SiteNotFoundError();
  const updated = await prisma.site.update({ where: { id: siteId }, data: { holdbackPercent } });
  return toSiteDTO(updated);
}

// Opt-in AI auto-approval (Site.autoApproveAiContent, docs/roadmap.md
// Hardening) — off by default, same explicit-opt-in shape as the toggles
// above. generateImageVariant (src/lib/sites/generateImage.ts) is the
// only place this is actually read; it only ever skips manual approval
// for an ALLOWED-boundary element, never a Restricted or Never one.
export async function setAutoApproveAiContent(
  organizationId: string,
  siteId: string,
  enabled: boolean,
): Promise<SiteDTO> {
  const site = await prisma.site.findFirst({ where: { id: siteId, organizationId } });
  if (!site) throw new SiteNotFoundError();
  const updated = await prisma.site.update({ where: { id: siteId }, data: { autoApproveAiContent: enabled } });
  return toSiteDTO(updated);
}

export async function createSite(organizationId: string, url: string): Promise<SiteDTO> {
  try {
    await assertSafeExternalUrl(url);
  } catch (error) {
    if (error instanceof UnsafeUrlError) throw new HttpError(400, error.message);
    throw error;
  }

  const site = await prisma.site.create({ data: { organizationId, url } });

  // Crawling + understanding takes real wall-clock time (up to ~60s crawl
  // + an AI call), so this can't run inside the request that created the
  // Site — the route returns immediately; the client polls GET
  // .../sites/[id] for status. A bare `void` fire-and-forget worked on a
  // persistent `next dev`/`next start` process but is a real bug on
  // Vercel's serverless functions: the runtime can freeze the invocation
  // the moment the HTTP response is sent, cutting this off mid-crawl
  // rather than actually running it in the background. `after()` is
  // Next.js's portable fix for exactly this — it tells the platform to
  // keep the invocation alive until the callback settles, and is a no-op
  // wrapper (still just runs after the response) on a persistent server.
  after(() =>
    runCrawlAndUnderstand(site.id).catch(() => {
      // runCrawlAndUnderstand catches and persists its own failures — this
      // catch only guards against something going wrong in that handling
      // itself, so a bug there can't produce an unhandled rejection.
    }),
  );

  return toSiteDTO(site);
}

async function markFailed(siteId: string, message: string): Promise<void> {
  await prisma.site.update({
    where: { id: siteId },
    data: { status: "FAILED", errorMessage: message },
  });
}

function cleanErrorMessage(error: unknown): string {
  if (error instanceof AiGenerationError || error instanceof CrawlError) {
    return error.message;
  }
  // Never leak internal error details (stack traces, DB errors, etc.) into
  // a field the org can see — this is stored for the org's own dashboard,
  // but "clean message, not an exception dump" is the right default anyway.
  return "Something went wrong while reading this site. Try again.";
}

// Common shape both the real AI result and the heuristic fallback produce,
// so persistence below doesn't care which one ran.
type PageClassification = {
  page: CrawledPageResult;
  classifiedElements: Array<{ elementId: string; section: ContentSection; elementType: ContentElementType }>;
};

async function classify(
  crawl: { pages: CrawledPageResult[] },
): Promise<{ method: UnderstandingMethod; pages: PageClassification[]; understanding: Omit<WebsiteUnderstandingResult, "pages"> }> {
  try {
    const result = await understandSite(crawl);
    return {
      method: "AI",
      pages: result.pages,
      understanding: result,
    };
  } catch (error) {
    // Falls back to the rule-based classifier on ANY understanding failure —
    // not configured, a bad/expired key, no credit balance, a rate limit, a
    // transient network error, or a malformed model response
    // (AiGenerationError). The reason doesn't change the outcome: "connect
    // your site" must work for every account, not just one where the AI
    // call happens to succeed today. See docs/decisions.md and
    // autoClassify.ts for what this mode does and doesn't claim to know.
    //
    // The *reason* is still worth logging server-side, though — a bare
    // `catch {}` here meant "not configured" and "the key is invalid/
    // rate-limited/erroring" were indistinguishable from the outside, which
    // is exactly the wrong thing to be blind to when debugging why AI
    // understanding isn't running in an environment that's supposed to
    // have a real key set.
    if (error instanceof AiNotConfiguredError) {
      console.warn("AI understanding skipped: ANTHROPIC_API_KEY is not set in this environment.");
    } else {
      console.error("AI understanding failed, falling back to rule-based classification:", error);
    }
    const classifiedByPageId = new Map(
      crawl.pages.map((page) => [page.url, classifyPageElements(page.url, page.elements)]),
    );

    const pages: PageClassification[] = crawl.pages.map((page) => ({
      page,
      classifiedElements: (classifiedByPageId.get(page.url) ?? []).map((c) => ({
        elementId: c.raw.id,
        section: c.section,
        elementType: c.elementType,
      })),
    }));

    return {
      method: "HEURISTIC",
      pages,
      understanding: buildHeuristicUnderstanding(crawl.pages, classifiedByPageId),
    };
  }
}

export async function runCrawlAndUnderstand(siteId: string): Promise<void> {
  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site) return;

  try {
    await prisma.site.update({ where: { id: siteId }, data: { status: "CRAWLING" } });
    const crawl = await crawlSite(site.url);

    await prisma.site.update({ where: { id: siteId }, data: { status: "UNDERSTANDING" } });
    const { method, pages, understanding } = await classify(crawl);

    // A retry (or any second run) on a site that already crawled
    // successfully once would otherwise hit CrawledPage's
    // @@unique([siteId, url]) on the very first insert and fail with an
    // opaque error. Re-crawling is only safe to clear and replace when
    // nothing real has been built on top of the old elements yet — if any
    // of them already carry a live personalization rule, deleting the
    // CrawledPage would cascade-delete that rule (onDelete: Cascade), which
    // must never happen silently just because someone re-ran a crawl.
    const priorPages = await prisma.crawledPage.findMany({ where: { siteId }, select: { id: true } });
    if (priorPages.length > 0) {
      const ruleCount = await prisma.elementPersonalizationRule.count({
        where: { contentElement: { crawledPageId: { in: priorPages.map((p) => p.id) } } },
      });
      if (ruleCount > 0) {
        throw new CrawlError(
          "This site already has live personalization rules from an earlier crawl — re-crawling would remove them, so it's blocked. Contact support if you need this site re-crawled.",
        );
      }
      await prisma.crawledPage.deleteMany({ where: { siteId } });
    }

    await prisma.$transaction(async (tx) => {
      for (const { page, classifiedElements } of pages) {
        if (classifiedElements.length === 0) continue;

        const crawledPage = await tx.crawledPage.create({
          data: {
            siteId,
            organizationId: site.organizationId,
            url: page.url,
            title: page.title,
          },
        });

        const rawById = new Map(page.elements.map((el) => [el.id, el]));

        await tx.contentElement.createMany({
          data: classifiedElements.flatMap((classified, index) => {
            const raw = rawById.get(classified.elementId);
            if (!raw) return [];
            const content = deriveElementContent(raw, classified.elementType);
            return [
              {
                crawledPageId: crawledPage.id,
                organizationId: site.organizationId,
                section: classified.section,
                elementType: classified.elementType,
                selector: raw.selector,
                currentContent: content.slice(0, 2000),
                order: index,
              },
            ];
          }),
        });
      }

      await tx.websiteUnderstanding.upsert({
        where: { siteId },
        create: {
          siteId,
          organizationId: site.organizationId,
          companySummary: understanding.companySummary,
          productSummary: understanding.productSummary,
          targetCustomers: understanding.targetCustomers,
          brandTone: understanding.brandTone as Prisma.InputJsonValue,
          valueProps: understanding.valueProps as Prisma.InputJsonValue,
          primaryCta: understanding.primaryCta,
          method,
        },
        update: {
          companySummary: understanding.companySummary,
          productSummary: understanding.productSummary,
          targetCustomers: understanding.targetCustomers,
          brandTone: understanding.brandTone as Prisma.InputJsonValue,
          valueProps: understanding.valueProps as Prisma.InputJsonValue,
          primaryCta: understanding.primaryCta,
          method,
        },
      });

      await tx.site.update({ where: { id: siteId }, data: { status: "READY", errorMessage: null } });
    });
  } catch (error) {
    // The org only ever sees the cleaned, generic message (cleanErrorMessage)
    // — never leak internals into a field the org can see. But until now
    // the real error was never logged anywhere either, server-side, which
    // made this genuinely undiagnosable in production (nothing to find in
    // Vercel's logs). Same posture as sendEmail's failure logging
    // (src/lib/email/): clean message to the user/DB, real error to the
    // server console. No token/credential ever flows through this path, so
    // logging the raw error here doesn't risk leaking one.
    console.error(`runCrawlAndUnderstand failed for site ${siteId}:`, error);
    await markFailed(siteId, cleanErrorMessage(error));
    return;
  }

  // Cold-start (docs/roadmap.md Hardening): deliberately outside the try
  // block above and separately caught — this is a cosmetic convenience,
  // not part of what makes the site connection succeed. The crawl already
  // committed and the site is already READY by this point; a failure
  // seeding starter audiences must never turn a successful connection
  // into a FAILED one.
  try {
    await seedDefaultAudiences(site.organizationId);
  } catch {
    // Nothing to do — the org just starts with a blank Audiences page,
    // same as before this feature existed.
  }
}
