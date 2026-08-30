import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { disableElementPersonalizationRule } from "@/lib/sites/personalization";
import { toErrorResponse } from "@/lib/api/respond";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string; ruleId: string }> },
) {
  try {
    const { organizationId, ruleId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const rule = await disableElementPersonalizationRule(organization.id, ruleId);
    return NextResponse.json({ rule });
  } catch (error) {
    return toErrorResponse(error);
  }
}
