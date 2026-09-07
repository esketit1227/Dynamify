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
  // The page's first real HEADLINE element by crawl order, or null if it
  // has none — never fabricated, and never any other element type standing
  // in for a headline.
  headline: string | null;
};

// Every crawled page across the org's sites, for the visual /content grid —
// same org-wide-by-organizationId shape as listConvertingPageCandidates
// (src/lib/recommendations/convertingPages.ts) and getOverviewStats. Four
// lean, indexed-on-organizationId queries run in parallel rather than one
// findMany({ include: { elements: true } }), which would pull every
// element's full text org-wide just to compute counts and one snippet —
// real, avoidable cost at scale.
export async function listContentPages(organizationId: string): Promise<ContentPageSummaryDTO[]> {
  const [pages, sectionGroups, personalizedGroups, headlineElements] = await Promise.all([
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
      where: { organizationId, elementType: "HEADLINE" },
      select: { crawledPageId: true, currentContent: true },
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

  // First HEADLINE per page — headlineElements is ordered by `order` ASC,
  // so the first write for a given page id is always the earliest one.
  const headlineByPage = new Map<string, string>();
  for (const el of headlineElements) {
    if (!headlineByPage.has(el.crawledPageId)) headlineByPage.set(el.crawledPageId, el.currentContent);
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
