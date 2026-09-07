import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { rejectPageDesign } from "@/lib/sites/designPage";
import { toErrorResponse } from "@/lib/api/respond";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string; pageDesignId: string }> },
) {
  try {
    const { organizationId, pageDesignId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    await rejectPageDesign(organization.id, pageDesignId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
