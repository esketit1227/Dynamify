import type { Campaign } from "@/generated/prisma/client";

export type CampaignDTO = {
  id: string;
  name: string;
  pageId: string;
  pageName: string;
  audienceId: string | null;
  trafficSource: string | null;
  goalEventType: Campaign["goalEventType"];
  splitPercent: number;
  status: Campaign["status"];
  createdAt: string;
};

export function toCampaignDTO(campaign: Campaign & { page: { name: string } }): CampaignDTO {
  return {
    id: campaign.id,
    name: campaign.name,
    pageId: campaign.pageId,
    pageName: campaign.page.name,
    audienceId: campaign.audienceId,
    trafficSource: campaign.trafficSource,
    goalEventType: campaign.goalEventType,
    splitPercent: campaign.splitPercent,
    status: campaign.status,
    createdAt: campaign.createdAt.toISOString(),
  };
}

export type CampaignResultsDTO = CampaignDTO & {
  results: {
    default: { visitors: number; goalEvents: number };
    variant: { visitors: number; goalEvents: number };
  };
};
