import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/auth/errors";
import { mapSiteToDefinition } from "@/lib/liveview/mapToDefinition";
import { effectiveBoundary } from "@/lib/sites/boundaries";
import { listAudiences } from "@/lib/audiences/service";
import type { ContentElementDTO } from "@/lib/sites/dto";
import type { AudienceDTO } from "@/lib/audiences/dto";
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

// docs/launch-plan.md §5D — the in-context reviewer needs the *full*
// picture per element (every rule status, the boundary), not the
// resolve()-only, APPROVED-filtered view getLiveViewDefinition
// deliberately uses. Same element-to-DTO mapping as toSiteDetailDTO
// (src/lib/sites/dto.ts), just scoped to one page instead of a whole
// site — kept as its own query rather than reusing that function, since
// pulling one page's worth of full detail out of the all-pages site
// fetch would mean fetching (and discarding) every other page's rules
// too, for no benefit here.
export async function getLiveViewPageElements(
  organizationId: string,
  crawledPageId: string,
): Promise<{ elements: ContentElementDTO[]; audiences: AudienceDTO[] }> {
  const page = await prisma.crawledPage.findFirst({ where: { id: crawledPageId, organizationId } });
  if (!page) throw new CrawledPageNotFoundError();

  const [rawElements, audiences] = await Promise.all([
    prisma.contentElement.findMany({
      where: { crawledPageId, organizationId },
      include: {
        personalizationRules: {
          include: { audience: { select: { name: true } }, elementVariant: true },
        },
      },
      orderBy: { order: "asc" },
    }),
    listAudiences(organizationId),
  ]);

  const elements: ContentElementDTO[] = rawElements.map((el) => ({
    id: el.id,
    section: el.section,
    elementType: el.elementType,
    currentContent: el.currentContent,
    selector: el.selector,
    boundary: effectiveBoundary(el),
    boundaryOverride: el.personalizationBoundary,
    personalizationRules: el.personalizationRules.map((rule) => ({
      id: rule.id,
      audienceId: rule.audienceId,
      audienceName: rule.audience.name,
      elementVariantId: rule.elementVariantId,
      content: rule.elementVariant.content,
      priority: rule.priority,
      status: rule.status,
      method: rule.elementVariant.method,
    })),
  }));

  return { elements, audiences };
}
