import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { getGeneratedExperience } from "@/lib/sites/generateExperience";
import { toErrorResponse } from "@/lib/api/respond";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string; experienceId: string }> },
) {
  try {
    const { organizationId, experienceId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const experience = await getGeneratedExperience(organization.id, experienceId);
    return NextResponse.json({ experience });
  } catch (error) {
    return toErrorResponse(error);
  }
}
