import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { setElementBoundary } from "@/lib/sites/personalization";
import { setElementBoundarySchema } from "@/lib/validation/sitePersonalization";
import { toErrorResponse } from "@/lib/api/respond";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ organizationId: string; elementId: string }> },
) {
  try {
    const { organizationId, elementId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const body = setElementBoundarySchema.parse(await request.json());
    const element = await setElementBoundary(organization.id, elementId, body.boundary);
    return NextResponse.json({ element });
  } catch (error) {
    return toErrorResponse(error);
  }
}
