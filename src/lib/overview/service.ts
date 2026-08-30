import { prisma } from "@/lib/db";
import type { ContentSection } from "@/generated/prisma/client";

export type OverviewStats = {
  siteCount: number;
  readySiteCount: number;
  totalPages: number;
  totalElements: number;
  sectionsIdentifiedCount: number;
  elementsBySection: Array<{ label: string; value: number }>;
  featuredSite: {
    id: string;
    hostname: string;
    summary: string;
    pageCount: number;
    elementCount: number;
    elementsPerPage: Array<{ label: string; value: number }>;
  } | null;
};

const SECTION_ORDER: ContentSection[] = [
  "HERO",
  "FEATURES",
  "TESTIMONIALS",
  "CTA",
  "PRICING",
  "FAQ",
  "NAV",
  "FOOTER",
  "OTHER",
];

// Every number here comes from a real query — no fabricated deltas, no
// placeholder metrics. Where there's nothing to compare against yet (e.g.
// no prior period), the card just doesn't show a comparison, rather than
// inventing one (CLAUDE.md: no fabricated numbers).
export async function getOverviewStats(organizationId: string): Promise<OverviewStats> {
  const [siteCount, readySiteCount, totalPages, sectionCounts] = await Promise.all([
    prisma.site.count({ where: { organizationId } }),
    prisma.site.count({ where: { organizationId, status: "READY" } }),
    prisma.crawledPage.count({ where: { organizationId } }),
    prisma.contentElement.groupBy({
      by: ["section"],
      where: { organizationId },
      _count: { _all: true },
    }),
  ]);

  const countBySection = new Map(sectionCounts.map((row) => [row.section, row._count._all]));
  const totalElements = sectionCounts.reduce((sum, row) => sum + row._count._all, 0);

  const elementsBySection = SECTION_ORDER.filter((section) => (countBySection.get(section) ?? 0) > 0).map(
    (section) => ({
      label: section.charAt(0) + section.slice(1).toLowerCase(),
      value: countBySection.get(section) ?? 0,
    }),
  );

  const featured = await prisma.site.findFirst({
    where: { organizationId, status: "READY" },
    orderBy: { updatedAt: "desc" },
    include: {
      understanding: true,
      pages: { include: { _count: { select: { elements: true } } }, orderBy: { crawledAt: "asc" } },
    },
  });

  const featuredSite = featured
    ? {
        id: featured.id,
        hostname: new URL(featured.url).hostname,
        summary: featured.understanding?.companySummary ?? "",
        pageCount: featured.pages.length,
        elementCount: featured.pages.reduce((sum, p) => sum + p._count.elements, 0),
        elementsPerPage: featured.pages.map((p, i) => ({
          label: `Page ${i + 1}`,
          value: p._count.elements,
        })),
      }
    : null;

  return {
    siteCount,
    readySiteCount,
    totalPages,
    totalElements,
    sectionsIdentifiedCount: elementsBySection.length,
    elementsBySection,
    featuredSite,
  };
}
