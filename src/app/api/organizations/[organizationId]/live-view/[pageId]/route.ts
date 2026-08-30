import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { getLiveViewDefinition } from "@/lib/liveview/service";
import { toErrorResponse } from "@/lib/api/respond";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string; pageId: string }> },
) {
  try {
    const { organizationId, pageId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const definition = await getLiveViewDefinition(organization.id, pageId);
    return NextResponse.json({ definition });
  } catch (error) {
    return toErrorResponse(error);
  }
}
