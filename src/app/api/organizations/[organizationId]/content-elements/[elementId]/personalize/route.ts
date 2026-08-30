import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { createElementPersonalization } from "@/lib/sites/personalization";
import { createElementPersonalizationSchema } from "@/lib/validation/sitePersonalization";
import { toErrorResponse } from "@/lib/api/respond";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string; elementId: string }> },
) {
  try {
    const { organizationId, elementId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const body = createElementPersonalizationSchema.parse(await request.json());
    const rule = await createElementPersonalization(organization.id, elementId, body);
    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
