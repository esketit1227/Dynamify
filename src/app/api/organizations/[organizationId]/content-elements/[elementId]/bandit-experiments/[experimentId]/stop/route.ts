import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { stopBanditExperiment } from "@/lib/experiments/bandit";
import { toErrorResponse } from "@/lib/api/respond";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string; experimentId: string }> },
) {
  try {
    const { organizationId, experimentId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const experiment = await stopBanditExperiment(organization.id, experimentId);
    return NextResponse.json({ experiment });
  } catch (error) {
    return toErrorResponse(error);
  }
}
