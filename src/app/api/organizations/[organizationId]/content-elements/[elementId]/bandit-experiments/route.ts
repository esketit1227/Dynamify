import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { createBanditExperiment, listBanditExperiments } from "@/lib/experiments/bandit";
import { createBanditExperimentSchema } from "@/lib/validation/banditExperiments";
import { toErrorResponse } from "@/lib/api/respond";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string; elementId: string }> },
) {
  try {
    const { organizationId, elementId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const result = await listBanditExperiments(organization.id, elementId);
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string; elementId: string }> },
) {
  try {
    const { organizationId, elementId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const body = createBanditExperimentSchema.parse(await request.json());
    const experiment = await createBanditExperiment(organization.id, elementId, body);
    return NextResponse.json({ experiment }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
