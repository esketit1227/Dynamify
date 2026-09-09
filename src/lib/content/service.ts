import { prisma } from "@/lib/db";
import { CrawledPageNotFoundError } from "@/lib/liveview/service";
import { buildLibraryFromElements, LIBRARY_TYPES, type Library } from "@/lib/sites/library";
import type { ContentSection, ContentElementType } from "@/generated/prisma/client";

export type ContentPageSummaryDTO = {
  id: string;
  url: string;
  title: string | null;
  siteId: string;
  siteHostname: string;
  elementCount: number;
  // Elements with at least one APPROVED rule — same "nothing goes live
  // unapproved" choke point getLiveViewDefinition already reads through
  // (src/lib/liveview/service.ts), so this count only ever reflects what's
  // actually live, never a PENDING/DISABLED rule sitting unreviewed.
  personalizedElementCount: number;
  sectionCounts: { section: ContentSection; count: number }[];
  // The page's first real HEADLINE/SUBHEADLINE/CTA_LABEL element by crawl
  // order, or null if it has none of that type — never fabricated, and
  // never any other element type standing in for one. Together these are
  // the real, default (unpersonalized — the grid has no visitor context to
  // resolve against) content the card's mini preview renders.
  headline: string | null;
  subheadline: string | null;
  ctaLabel: string | null;
};

// Every crawled page across the org's sites, for the visual /content grid —
// same org-wide-by-organizationId shape as listConvertingPageCandidates
// (src/lib/recommendations/convertingPages.ts) and getOverviewStats. Four
// lean, indexed-on-organizationId queries run in parallel rather than one
// findMany({ include: { elements: true } }), which would pull every
// element's full text org-wide just to compute counts and a few snippets —
// real, avoidable cost at scale. The snippet query is bounded to exactly
// the three types the card preview renders, never every element.
export async function listContentPages(organizationId: string): Promise<ContentPageSummaryDTO[]> {
  const [pages, sectionGroups, personalizedGroups, previewElements] = await Promise.all([
    prisma.crawledPage.findMany({
      where: { organizationId },
      select: {
        id: true,
        url: true,
        title: true,
        siteId: true,
        site: { select: { url: true } },
        _count: { select: { elements: true } },
      },
      orderBy: { crawledAt: "desc" },
    }),
    prisma.contentElement.groupBy({
      by: ["crawledPageId", "section"],
      where: { organizationId },
      _count: { _all: true },
    }),
    prisma.contentElement.groupBy({
      by: ["crawledPageId"],
      where: { organizationId, personalizationRules: { some: { status: "APPROVED" } } },
      _count: { _all: true },
    }),
    prisma.contentElement.findMany({
      where: { organizationId, elementType: { in: ["HEADLINE", "SUBHEADLINE", "CTA_LABEL"] } },
      select: { crawledPageId: true, elementType: true, currentContent: true },
      orderBy: { order: "asc" },
    }),
  ]);

  if (pages.length === 0) return [];

  const sectionsByPage = new Map<string, { section: ContentSection; count: number }[]>();
  for (const g of sectionGroups) {
    const list = sectionsByPage.get(g.crawledPageId) ?? [];
    list.push({ section: g.section, count: g._count._all });
    sectionsByPage.set(g.crawledPageId, list);
  }

  const personalizedByPage = new Map(personalizedGroups.map((g) => [g.crawledPageId, g._count._all]));

  // First element of each type per page — previewElements is ordered by
  // `order` ASC, so the first write for a given (page, type) pair is
  // always the earliest one.
  const headlineByPage = new Map<string, string>();
  const subheadlineByPage = new Map<string, string>();
  const ctaLabelByPage = new Map<string, string>();
  const byType = { HEADLINE: headlineByPage, SUBHEADLINE: subheadlineByPage, CTA_LABEL: ctaLabelByPage };
  for (const el of previewElements) {
    const map = byType[el.elementType as keyof typeof byType];
    if (map && !map.has(el.crawledPageId)) map.set(el.crawledPageId, el.currentContent);
  }

  return pages.map((page) => ({
    id: page.id,
    url: page.url,
    title: page.title,
    siteId: page.siteId,
    siteHostname: new URL(page.site.url).hostname,
    elementCount: page._count.elements,
    personalizedElementCount: personalizedByPage.get(page.id) ?? 0,
    sectionCounts: sectionsByPage.get(page.id) ?? [],
    headline: headlineByPage.get(page.id) ?? null,
    subheadline: subheadlineByPage.get(page.id) ?? null,
    ctaLabel: ctaLabelByPage.get(page.id) ?? null,
  }));
}

export async function getContentPageSummary(
  organizationId: string,
  crawledPageId: string,
): Promise<Pick<ContentPageSummaryDTO, "id" | "url" | "title" | "siteId" | "siteHostname">> {
  const page = await prisma.crawledPage.findFirst({
    where: { id: crawledPageId, organizationId },
    select: { id: true, url: true, title: true, siteId: true, site: { select: { url: true } } },
  });
  if (!page) throw new CrawledPageNotFoundError();

  return {
    id: page.id,
    url: page.url,
    title: page.title,
    siteId: page.siteId,
    siteHostname: new URL(page.site.url).hostname,
  };
}

// The site-wide counterpart to live-view.tsx's page-scoped library — pulls
// real IMAGE/LOGO/CTA_HREF alternatives from every page of the site, not
// just the one currently open, restoring the broader scope
// site-detail.tsx's old buildLibrary(site.pages) had before that section
// moved here.
export async function getSiteWideImageLibrary(organizationId: string, siteId: string): Promise<Library> {
  const elements = await prisma.contentElement.findMany({
    where: {
      organizationId,
      elementType: { in: [...LIBRARY_TYPES] as ContentElementType[] },
      crawledPage: { siteId },
    },
    select: { elementType: true, currentContent: true },
  });
  return buildLibraryFromElements(elements);
}
