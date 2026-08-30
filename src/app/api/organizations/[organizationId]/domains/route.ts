import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { listDomains, addDomain } from "@/lib/domains/service";
import { addDomainSchema } from "@/lib/validation/integrations";
import { toErrorResponse } from "@/lib/api/respond";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const domains = await listDomains(organization.id);
    return NextResponse.json({ domains });
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
    const body = addDomainSchema.parse(await request.json());
    const domain = await addDomain(organization.id, body.hostname);
    return NextResponse.json({ domain }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
