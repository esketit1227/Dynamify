import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { createAudienceProposal } from "@/lib/ai/proposals";
import { generateAudienceProposalSchema } from "@/lib/validation/ai";
import { rateLimit } from "@/lib/auth/rateLimit";
import { RateLimitedError } from "@/lib/auth/errors";
import { toErrorResponse } from "@/lib/api/respond";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await params;
    const { organization } = await requireOrgAccess(organizationId);

    // CLAUDE.md: rate limit AI calls too, not just auth/collection endpoints.
    const limited = await rateLimit(`ai:${organization.id}`, { limit: 10, windowMs: 60 * 1000 });
    if (!limited.allowed) {
      throw new RateLimitedError("Too many AI requests. Try again shortly.", limited.retryAfterMs);
    }

    const body = generateAudienceProposalSchema.parse(await request.json());
    const proposal = await createAudienceProposal(organization.id, body.businessDescription);
    return NextResponse.json({ proposal }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
