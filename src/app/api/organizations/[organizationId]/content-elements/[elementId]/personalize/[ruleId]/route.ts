import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { deleteElementPersonalizationRule, updateElementPersonalizationRuleContent } from "@/lib/sites/personalization";
import { updateElementPersonalizationRuleContentSchema } from "@/lib/validation/sitePersonalization";
import { toErrorResponse } from "@/lib/api/respond";

type Params = { params: Promise<{ organizationId: string; ruleId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { organizationId, ruleId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const body = updateElementPersonalizationRuleContentSchema.parse(await request.json());
    const rule = await updateElementPersonalizationRuleContent(organization.id, ruleId, body.content);
    return NextResponse.json({ rule });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { organizationId, ruleId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    await deleteElementPersonalizationRule(organization.id, ruleId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
