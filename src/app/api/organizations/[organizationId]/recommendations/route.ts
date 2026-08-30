import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { listAllRecommendations, generateAllRecommendations } from "@/lib/recommendations/service";
import { toErrorResponse } from "@/lib/api/respond";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const recommendations = await listAllRecommendations(organization.id);
    return NextResponse.json({ recommendations });
  } catch (error) {
    return toErrorResponse(error);
  }
}

// Runs the segment analysis fresh across every connected site's recent
// traffic and upserts any qualifying recommendations — a deliberate
// action (not run on every page load) since it does real analysis work
// across every page on every site.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const recommendations = await generateAllRecommendations(organization.id);
    return NextResponse.json({ recommendations });
  } catch (error) {
    return toErrorResponse(error);
  }
}
