import { NextResponse } from "next/server";
import { campaignAssignmentRequestSchema } from "@/lib/validation/campaigns";
import { assignVisitor } from "@/lib/campaigns/assignment";
import { rateLimit, clientIpFromRequest } from "@/lib/auth/rateLimit";
import { RateLimitedError } from "@/lib/auth/errors";
import { toErrorResponse } from "@/lib/api/respond";
import { prisma } from "@/lib/db";

// Public, unauthenticated — a visitor's browser calls this to learn (and
// stickily persist) which arm of an active campaign it's in. Rate-limited
// like /api/collect; the organizationId is resolved from the campaign
// itself, never trusted from the client.
export async function POST(request: Request) {
  try {
    const limited = await rateLimit(`campaign-assignment:${clientIpFromRequest(request)}`, {
      limit: 60,
      windowMs: 60 * 1000,
    });
    if (!limited.allowed) {
      throw new RateLimitedError("Too many requests.", limited.retryAfterMs);
    }

    const body = campaignAssignmentRequestSchema.parse(await request.json());

    const campaign = await prisma.campaign.findFirst({
      where: { id: body.campaignId, status: "ACTIVE" },
      select: { id: true, organizationId: true },
    });
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const variant = await assignVisitor(campaign.organizationId, campaign.id, body.visitorId);
    return NextResponse.json({ variant });
  } catch (error) {
    return toErrorResponse(error);
  }
}
