import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { listAudiences, createAudience } from "@/lib/audiences/service";
import { createAudienceSchema } from "@/lib/validation/audiences";
import { toErrorResponse } from "@/lib/api/respond";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const audiences = await listAudiences(organization.id);
    return NextResponse.json({ audiences });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const body = createAudienceSchema.parse(await request.json());
    const audience = await createAudience(organization.id, body);
    return NextResponse.json({ audience }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
