import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { listCampaigns, createCampaign } from "@/lib/campaigns/service";
import { createCampaignSchema } from "@/lib/validation/campaigns";
import { toErrorResponse } from "@/lib/api/respond";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const campaigns = await listCampaigns(organization.id);
    return NextResponse.json({ campaigns });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const body = createCampaignSchema.parse(await request.json());
    const campaign = await createCampaign(organization.id, body);
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
