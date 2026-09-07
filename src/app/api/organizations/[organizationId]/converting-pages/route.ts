import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { listConvertingPageCandidates } from "@/lib/recommendations/convertingPages";
import { toErrorResponse } from "@/lib/api/respond";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const candidates = await listConvertingPageCandidates(organization.id);
    return NextResponse.json({ candidates });
  } catch (error) {
    return toErrorResponse(error);
  }
}
