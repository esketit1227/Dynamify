import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { verifyDomain } from "@/lib/domains/service";
import { toErrorResponse } from "@/lib/api/respond";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string; domainId: string }> },
) {
  try {
    const { organizationId, domainId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const domain = await verifyDomain(organization.id, domainId);
    return NextResponse.json({ domain });
  } catch (error) {
    return toErrorResponse(error);
  }
}
