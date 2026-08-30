import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { acceptRecommendation } from "@/lib/recommendations/service";
import { toErrorResponse } from "@/lib/api/respond";

const bodySchema = z.object({ audienceName: z.string().trim().max(100).optional() });

// Creates (or reuses) a real Audience for this segment and, in the same
// action, tries to generate a coordinated full-experience content bundle
// for it — see acceptRecommendation's own comment. The response always
// reflects a successful accept; experienceError (if present) only means
// the generation half didn't produce anything yet, not that accepting
// failed.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string; recommendationId: string }> },
) {
  try {
    const { organizationId, recommendationId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const raw = await request.json().catch(() => ({}));
    const body = bodySchema.parse(raw);
    const result = await acceptRecommendation(organization.id, recommendationId, body.audienceName);
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
