import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { generateExperienceForRecommendation } from "@/lib/recommendations/service";
import { toErrorResponse } from "@/lib/api/respond";

// The manual recovery path for when accepting a recommendation didn't
// produce a usable experience the first time (rate limited, nothing
// eligible at that moment) — reuses the identical generation call
// acceptRecommendation tries automatically.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string; recommendationId: string }> },
) {
  try {
    const { organizationId, recommendationId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const experience = await generateExperienceForRecommendation(organization.id, recommendationId);
    return NextResponse.json({ experience });
  } catch (error) {
    return toErrorResponse(error);
  }
}
