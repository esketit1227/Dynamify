import { prisma } from "@/lib/db";
import { CrawledPageNotFoundError } from "@/lib/liveview/service";
import { DEFAULT_AUDIENCES } from "@/lib/audiences/service";
import { generateExperience, type GeneratedExperienceDTO } from "@/lib/sites/generateExperience";
import { findMatchingAudience, findExperienceFor, assertExperienceGenerationAllowed } from "./service";

// The one starter audience this feature ever targets, and why: every other
// signal a "converting page" could target either needs real traffic
// (Recommendation's own field/value segments — the thing this feature
// exists to not require) or doesn't actually work yet on a real visitor at
// all. "New visitors"/"Returning visitors" (the other two DEFAULT_AUDIENCES
// presets) key off a `returning` VisitorContext attribute that only
// src/lib/tracking/visitorContext.ts (the retired hosted-page module, per
// docs/roadmap.md's 2026-08-30 cleanup) and the Live View simulator ever
// populate — dynamify-embed.js's real buildEffectiveContext never sets it,
// so a rule targeting it would never fire for an actual visitor. `device`,
// by contrast, is computed unconditionally from the viewport on every real
// page load (detectDevice() in dynamify-embed.js) — no opt-in toggle, no
// visitor-tracking cookie, no traffic history required — so it's the only
// segment guaranteed to actually match a real visitor from the moment the
// embed script is installed. Found, not assumed: confirmed by grep before
// relying on it.
const MOBILE_VISITORS_PRESET = DEFAULT_AUDIENCES.find((preset) => preset.field === "device")!;

// Find-or-create, mirroring acceptRecommendation's own
// `findMatchingAudience ?? create` pattern exactly: reuses the org's real
// "Mobile visitors" audience if seedDefaultAudiences (or a human) already
// created one, otherwise creates it fresh. Never duplicates — a second call
// for the same org finds the first call's row.
async function ensureMobileVisitorsAudience(organizationId: string) {
  const existing = await findMatchingAudience(organizationId, MOBILE_VISITORS_PRESET.field, String(MOBILE_VISITORS_PRESET.value));
  if (existing) return existing;

  return prisma.audience.create({
    data: {
      organizationId,
      name: MOBILE_VISITORS_PRESET.name,
      description: MOBILE_VISITORS_PRESET.description,
      rules: {
        create: [
          {
            organizationId,
            field: MOBILE_VISITORS_PRESET.field,
            operator: MOBILE_VISITORS_PRESET.operator,
            value: MOBILE_VISITORS_PRESET.value,
            groupIndex: 0,
          },
        ],
      },
    },
  });
}

export type ConvertingPageCandidateDTO = {
  crawledPageId: string;
  siteId: string;
  siteUrl: string;
  pageUrl: string;
  pageTitle: string | null;
  // Null until someone actually generates one for this page — see
  // generateConvertingPage. Re-derived at read time, same posture as
  // RecommendationDTO.experience, so approving/pausing an individual piece
  // through the normal per-element flow is reflected here on the next read.
  experience: GeneratedExperienceDTO | null;
};

// Every crawled page across the org's sites is a candidate — unlike
// Recommendation's traffic segments, nothing here needs a sample-size
// threshold to clear, since the only input is the crawl itself (a
// CrawledPage row only ever exists once a crawl actually succeeded). Never
// creates the "Mobile visitors" audience just to answer a read — only
// generateConvertingPage does that — so a page with no audience yet
// correctly reports no experience rather than one that could never exist.
export async function listConvertingPageCandidates(organizationId: string): Promise<ConvertingPageCandidateDTO[]> {
  const pages = await prisma.crawledPage.findMany({
    where: { organizationId },
    select: { id: true, siteId: true, url: true, title: true, site: { select: { url: true } } },
    orderBy: { crawledAt: "desc" },
  });
  if (pages.length === 0) return [];

  const audience = await findMatchingAudience(organizationId, MOBILE_VISITORS_PRESET.field, String(MOBILE_VISITORS_PRESET.value));

  return Promise.all(
    pages.map(async (page) => ({
      crawledPageId: page.id,
      siteId: page.siteId,
      siteUrl: page.site.url,
      pageUrl: page.url,
      pageTitle: page.title,
      experience: audience ? await findExperienceFor(organizationId, page.id, audience.id) : null,
    })),
  );
}

// The actual crawl-only generation: no Recommendation row, no traffic, no
// audience the user has to pick first — the only inputs are the page's own
// crawled elements and the site's WebsiteUnderstanding, exactly like
// generateExperience already requires for any page. Shares the same
// generate-experience:<org> rate-limit budget as the traffic-triggered path
// (assertExperienceGenerationAllowed) — it's the same expensive AI call
// either way, and cost control shouldn't have two separate ceilings for one
// underlying action.
export async function generateConvertingPage(
  organizationId: string,
  crawledPageId: string,
): Promise<GeneratedExperienceDTO> {
  const page = await prisma.crawledPage.findFirst({
    where: { id: crawledPageId, organizationId },
    select: { id: true },
  });
  if (!page) throw new CrawledPageNotFoundError();

  const audience = await ensureMobileVisitorsAudience(organizationId);
  await assertExperienceGenerationAllowed(organizationId);
  return generateExperience(organizationId, page.id, audience.id);
}
