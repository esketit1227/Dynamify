import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { updateComponent, deleteComponent } from "@/lib/pages/service";
import { updateComponentSchema } from "@/lib/validation/pages";
import { toErrorResponse } from "@/lib/api/respond";

type Params = { params: Promise<{ organizationId: string; pageId: string; componentId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { organizationId, componentId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const body = updateComponentSchema.parse(await request.json());
    const component = await updateComponent(organization.id, componentId, body);
    return NextResponse.json({ component });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { organizationId, componentId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    await deleteComponent(organization.id, componentId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
