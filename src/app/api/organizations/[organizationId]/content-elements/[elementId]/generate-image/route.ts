import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { generateImageVariant } from "@/lib/sites/generateImage";
import { generateImageSchema } from "@/lib/validation/generateImage";
import { rateLimit } from "@/lib/auth/rateLimit";
import { RateLimitedError } from "@/lib/auth/errors";
import { toErrorResponse } from "@/lib/api/respond";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string; elementId: string }> },
) {
  try {
    const { organizationId, elementId } = await params;
    const { organization } = await requireOrgAccess(organizationId);

    // Much stricter than suggest-variant's 20/minute — real generation
    // cost per call, not a text completion.
    const limited = await rateLimit(`generate-image:${organization.id}`, {
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });
    if (!limited.allowed) {
      throw new RateLimitedError("Too many image generations recently. Try again later.", limited.retryAfterMs);
    }

    const body = generateImageSchema.parse(await request.json());
    const rule = await generateImageVariant(organization.id, elementId, body);

    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
