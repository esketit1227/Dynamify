import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { rejectAllGeneratedExperience } from "@/lib/sites/generateExperience";
import { toErrorResponse } from "@/lib/api/respond";

// Discards the whole batch and every rule/variant it produced — the
// explicit "reject all" action; disabling or deleting one piece at a time
// still goes through the normal per-element flow unchanged.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string; experienceId: string }> },
) {
  try {
    const { organizationId, experienceId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    await rejectAllGeneratedExperience(organization.id, experienceId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
