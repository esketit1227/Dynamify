import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { setAutoOptimizeEnabled } from "@/lib/organizations/service";
import { setAutoOptimizeEnabledSchema } from "@/lib/validation/organizations";
import { toErrorResponse } from "@/lib/api/respond";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const body = setAutoOptimizeEnabledSchema.parse(await request.json());
    const enabled = await setAutoOptimizeEnabled(organization.id, body.enabled);
    return NextResponse.json({ enabled });
  } catch (error) {
    return toErrorResponse(error);
  }
}
