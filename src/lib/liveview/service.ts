import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/auth/errors";
import { mapSiteToDefinition } from "@/lib/liveview/mapToDefinition";
import type { PageDefinition } from "@dynamify/personalization-sdk";

export class CrawledPageNotFoundError extends HttpError {
  constructor() {
    super(404, "Page not found");
  }
}

export type LiveViewPageOption = {
  id: string;
  url: string;
  title: string | null;
  siteId: string;
  hasPersonalization: boolean;
};

// Pages that already have an approved personalization rule sort first, so
// the default selection (callers pick pages[0]) opens on something that
// actually demonstrates a difference — an account with several connected
// sites would otherwise land on whichever was crawled longest ago,
// regardless of whether it has anything configured.
export async function listLiveViewPages(organizationId: string): Promise<LiveViewPageOption[]> {
  const pages = await prisma.crawledPage.findMany({
    where: { organizationId, site: { status: "READY" } },
    select: {
      id: true,
      url: true,
      title: true,
      siteId: true,
      elements: {
        select: {
          personalizationRules: { where: { status: "APPROVED" }, select: { id: true }, take: 1 },
        },
      },
    },
    orderBy: { crawledAt: "asc" },
  });

  return pages
    .map(({ elements, ...page }) => ({
      ...page,
      hasPersonalization: elements.some((el) => el.personalizationRules.length > 0),
    }))
    .sort((a, b) => Number(b.hasPersonalization) - Number(a.hasPersonalization));
}

export async function getLiveViewDefinition(
  organizationId: string,
  crawledPageId: string,
): Promise<PageDefinition> {
  const page = await prisma.crawledPage.findFirst({
    where: { id: crawledPageId, organizationId },
  });
  if (!page) throw new CrawledPageNotFoundError();

  const [elements, audiences] = await Promise.all([
    prisma.contentElement.findMany({
      where: { crawledPageId },
      include: {
        variants: true,
        // "Nothing goes live unapproved" (docs/roadmap.md Phase 3) — this is
        // the one choke point every resolver (Live View, the demo window,
        // preview-html) reads through, so filtering here makes a PENDING
        // rule structurally invisible everywhere at once.
        personalizationRules: { where: { status: "APPROVED" } },
      },
      orderBy: { order: "asc" },
    }),
    prisma.audience.findMany({ where: { organizationId }, include: { rules: true } }),
  ]);

  return mapSiteToDefinition({ pageId: page.id, elements, audiences });
}
