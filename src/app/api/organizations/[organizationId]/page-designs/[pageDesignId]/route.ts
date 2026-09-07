import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { getPageDesign } from "@/lib/sites/designPage";
import { toErrorResponse } from "@/lib/api/respond";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string; pageDesignId: string }> },
) {
  try {
    const { organizationId, pageDesignId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const design = await getPageDesign(organization.id, pageDesignId);
    return NextResponse.json({ design });
  } catch (error) {
    return toErrorResponse(error);
  }
}
