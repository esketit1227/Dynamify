import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { suggestVariant } from "@/lib/sites/suggestVariant";
import { suggestVariantSchema } from "@/lib/validation/suggestVariant";
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

    const limited = await rateLimit(`suggest-variant:${organization.id}`, {
      limit: 20,
      windowMs: 60 * 1000,
    });
    if (!limited.allowed) {
      throw new RateLimitedError("Too many requests. Try again shortly.", limited.retryAfterMs);
    }

    const body = suggestVariantSchema.parse(await request.json());
    const suggestion = await suggestVariant(organization.id, elementId, body);

    return NextResponse.json({ suggestion });
  } catch (error) {
    return toErrorResponse(error);
  }
}
