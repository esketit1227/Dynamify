import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/auth/errors";
import { toCampaignDTO, type CampaignDTO, type CampaignResultsDTO } from "./dto";
import type { CreateCampaignInput } from "@/lib/validation/campaigns";

export class CampaignNotFoundError extends HttpError {
  constructor() {
    super(404, "Campaign not found");
  }
}

export class PageNotFoundError extends HttpError {
  constructor() {
    super(404, "Page not found");
  }
}

export async function listCampaigns(organizationId: string): Promise<CampaignDTO[]> {
  const campaigns = await prisma.campaign.findMany({
    where: { organizationId },
    include: { page: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return campaigns.map(toCampaignDTO);
}

export async function createCampaign(
  organizationId: string,
  input: CreateCampaignInput,
): Promise<CampaignDTO> {
  const page = await prisma.page.findFirst({ where: { id: input.pageId, organizationId } });
  if (!page) throw new PageNotFoundError();

  if (input.audienceId) {
    const audience = await prisma.audience.findFirst({
      where: { id: input.audienceId, organizationId },
    });
    if (!audience) throw new HttpError(404, "Audience not found");
  }

  const campaign = await prisma.campaign.create({
    data: {
      organizationId,
      name: input.name,
      pageId: input.pageId,
      audienceId: input.audienceId,
      trafficSource: input.trafficSource,
      goalEventType: input.goalEventType,
      splitPercent: input.splitPercent,
      status: "ACTIVE",
    },
    include: { page: { select: { name: true } } },
  });

  return toCampaignDTO(campaign);
}

export async function getCampaignResults(
  organizationId: string,
  campaignId: string,
): Promise<CampaignResultsDTO> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId },
    include: { page: { select: { name: true } } },
  });
  if (!campaign) throw new CampaignNotFoundError();

  const [defaultVisitors, variantVisitors, defaultGoalEvents, variantGoalEvents] =
    await Promise.all([
      prisma.campaignAssignment.count({ where: { campaignId, variant: "DEFAULT" } }),
      prisma.campaignAssignment.count({ where: { campaignId, variant: "VARIANT" } }),
      prisma.event.count({
        where: {
          organizationId,
          campaignId,
          type: campaign.goalEventType,
          visitorId: {
            in: (
              await prisma.campaignAssignment.findMany({
                where: { campaignId, variant: "DEFAULT" },
                select: { visitorId: true },
              })
            ).map((a) => a.visitorId),
          },
        },
      }),
      prisma.event.count({
        where: {
          organizationId,
          campaignId,
          type: campaign.goalEventType,
          visitorId: {
            in: (
              await prisma.campaignAssignment.findMany({
                where: { campaignId, variant: "VARIANT" },
                select: { visitorId: true },
              })
            ).map((a) => a.visitorId),
          },
        },
      }),
    ]);

  return {
    ...toCampaignDTO(campaign),
    results: {
      default: { visitors: defaultVisitors, goalEvents: defaultGoalEvents },
      variant: { visitors: variantVisitors, goalEvents: variantGoalEvents },
    },
  };
}
