import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { approveAllGeneratedExperience } from "@/lib/sites/generateExperience";
import { toErrorResponse } from "@/lib/api/respond";

// Batch-transitions every PENDING rule in the group to APPROVED — a rule
// already individually disabled is left alone (see
// approveAllGeneratedExperience's own comment).
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string; experienceId: string }> },
) {
  try {
    const { organizationId, experienceId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const experience = await approveAllGeneratedExperience(organization.id, experienceId);
    return NextResponse.json({ experience });
  } catch (error) {
    return toErrorResponse(error);
  }
}
