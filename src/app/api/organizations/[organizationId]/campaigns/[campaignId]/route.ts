import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { getCampaignResults } from "@/lib/campaigns/service";
import { toErrorResponse } from "@/lib/api/respond";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string; campaignId: string }> },
) {
  try {
    const { organizationId, campaignId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const campaign = await getCampaignResults(organization.id, campaignId);
    return NextResponse.json({ campaign });
  } catch (error) {
    return toErrorResponse(error);
  }
}
