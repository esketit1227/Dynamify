import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { getAudience, updateAudience, deleteAudience } from "@/lib/audiences/service";
import { updateAudienceSchema } from "@/lib/validation/audiences";
import { toErrorResponse } from "@/lib/api/respond";

type Params = { params: Promise<{ organizationId: string; audienceId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { organizationId, audienceId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const audience = await getAudience(organization.id, audienceId);
    return NextResponse.json({ audience });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { organizationId, audienceId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const body = updateAudienceSchema.parse(await request.json());
    const audience = await updateAudience(organization.id, audienceId, body);
    return NextResponse.json({ audience });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { organizationId, audienceId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    await deleteAudience(organization.id, audienceId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
