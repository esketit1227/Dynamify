import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { ignoreRecommendation } from "@/lib/recommendations/service";
import { toErrorResponse } from "@/lib/api/respond";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string; recommendationId: string }> },
) {
  try {
    const { organizationId, recommendationId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    await ignoreRecommendation(organization.id, recommendationId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
