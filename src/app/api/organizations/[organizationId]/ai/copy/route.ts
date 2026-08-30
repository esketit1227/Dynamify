import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { createCopyProposal } from "@/lib/ai/proposals";
import { generateCopyProposalSchema } from "@/lib/validation/ai";
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

    const limited = await rateLimit(`ai:${organization.id}`, { limit: 10, windowMs: 60 * 1000 });
    if (!limited.allowed) {
      throw new RateLimitedError("Too many AI requests. Try again shortly.", limited.retryAfterMs);
    }

    const body = generateCopyProposalSchema.parse(await request.json());
    const proposal = await createCopyProposal(organization.id, body.componentId, body.type, body.brief);
    return NextResponse.json({ proposal }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
