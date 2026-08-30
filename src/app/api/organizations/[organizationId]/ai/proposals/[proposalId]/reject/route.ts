import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { rejectProposal } from "@/lib/ai/proposals";
import { toErrorResponse } from "@/lib/api/respond";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string; proposalId: string }> },
) {
  try {
    const { organizationId, proposalId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    await rejectProposal(organization.id, proposalId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
