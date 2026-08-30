import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { deleteElementPersonalizationRule } from "@/lib/sites/personalization";
import { toErrorResponse } from "@/lib/api/respond";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string; ruleId: string }> },
) {
  try {
    const { organizationId, ruleId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    await deleteElementPersonalizationRule(organization.id, ruleId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
