import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { getLiveViewDefinition, getLiveViewPageElements } from "@/lib/liveview/service";
import { toErrorResponse } from "@/lib/api/respond";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string; pageId: string }> },
) {
  try {
    const { organizationId, pageId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const [definition, { elements, audiences }] = await Promise.all([
      getLiveViewDefinition(organization.id, pageId),
      getLiveViewPageElements(organization.id, pageId),
    ]);
    return NextResponse.json({ definition, elements, audiences });
  } catch (error) {
    return toErrorResponse(error);
  }
}
