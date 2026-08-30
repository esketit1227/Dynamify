import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/auth/errors";
import type { CampaignVariantAssignment } from "@/generated/prisma/client";

export class CampaignNotFoundError extends HttpError {
  constructor() {
    super(404, "Campaign not found");
  }
}

// At most one active campaign renders per page in this MVP — no queueing/
// prioritization between concurrent campaigns, per roadmap's "no
// statistical engine yet."
export async function getActiveCampaignForPage(pageId: string) {
  return prisma.campaign.findFirst({
    where: { pageId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
}

// Sticky per-visitor 50/50 (or configured split) assignment. A visitor sees
// the same arm on every subsequent visit — assigned once, on first exposure.
export async function assignVisitor(
  organizationId: string,
  campaignId: string,
  visitorId: string,
): Promise<CampaignVariantAssignment> {
  const existing = await prisma.campaignAssignment.findUnique({
    where: { campaignId_visitorId: { campaignId, visitorId } },
  });
  if (existing) return existing.variant;

  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, organizationId } });
  if (!campaign) throw new CampaignNotFoundError();

  const variant: CampaignVariantAssignment =
    Math.random() * 100 < campaign.splitPercent ? "VARIANT" : "DEFAULT";

  try {
    await prisma.campaignAssignment.create({
      data: { organizationId, campaignId, visitorId, variant },
    });
    return variant;
  } catch {
    // Race: two requests from the same new visitor assigned concurrently.
    // Whichever wrote first wins — read it back rather than erroring.
    const assignment = await prisma.campaignAssignment.findUnique({
      where: { campaignId_visitorId: { campaignId, visitorId } },
    });
    return assignment?.variant ?? variant;
  }
}
