import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { enableElementPersonalizationRule } from "@/lib/sites/personalization";
import { toErrorResponse } from "@/lib/api/respond";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string; ruleId: string }> },
) {
  try {
    const { organizationId, ruleId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const rule = await enableElementPersonalizationRule(organization.id, ruleId);
    return NextResponse.json({ rule });
  } catch (error) {
    return toErrorResponse(error);
  }
}
