import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { createPersonalization } from "@/lib/personalization/service";
import { createPersonalizationSchema } from "@/lib/validation/pages";
import { toErrorResponse } from "@/lib/api/respond";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string; componentId: string }> },
) {
  try {
    const { organizationId, componentId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const body = createPersonalizationSchema.parse(await request.json());
    const rule = await createPersonalization(organization.id, componentId, body);
    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
