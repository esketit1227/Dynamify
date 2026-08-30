import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { deleteDomain } from "@/lib/domains/service";
import { toErrorResponse } from "@/lib/api/respond";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string; domainId: string }> },
) {
  try {
    const { organizationId, domainId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    await deleteDomain(organization.id, domainId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
