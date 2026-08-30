import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { setRetentionWindows } from "@/lib/organizations/service";
import { setRetentionWindowsSchema } from "@/lib/validation/organizations";
import { toErrorResponse } from "@/lib/api/respond";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const body = setRetentionWindowsSchema.parse(await request.json());
    const windows = await setRetentionWindows(organization.id, body);
    return NextResponse.json({ windows });
  } catch (error) {
    return toErrorResponse(error);
  }
}
