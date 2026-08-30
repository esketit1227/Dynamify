import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { listProposals } from "@/lib/ai/proposals";
import { toErrorResponse } from "@/lib/api/respond";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const proposals = await listProposals(organization.id);
    return NextResponse.json({ proposals });
  } catch (error) {
    return toErrorResponse(error);
  }
}
