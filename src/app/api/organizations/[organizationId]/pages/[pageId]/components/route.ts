import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { addComponent } from "@/lib/pages/service";
import { addComponentSchema } from "@/lib/validation/pages";
import { toErrorResponse } from "@/lib/api/respond";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string; pageId: string }> },
) {
  try {
    const { organizationId, pageId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const body = addComponentSchema.parse(await request.json());
    const component = await addComponent(organization.id, pageId, body);
    return NextResponse.json({ component }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
