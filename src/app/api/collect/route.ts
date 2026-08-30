import { NextResponse } from "next/server";
import { collectEventSchema } from "@/lib/validation/collect";
import { recordEvent } from "@/lib/tracking/service";
import { rateLimit, clientIpFromRequest } from "@/lib/auth/rateLimit";
import { RateLimitedError } from "@/lib/auth/errors";
import { toErrorResponse } from "@/lib/api/respond";

// Public, unauthenticated collection endpoint — rate-limited per CLAUDE.md's
// explicit requirement ("Rate limit auth, public collection endpoints,
// uploads, and AI calls").
export async function POST(request: Request) {
  try {
    const limited = await rateLimit(`collect:${clientIpFromRequest(request)}`, {
      limit: 120,
      windowMs: 60 * 1000,
    });
    if (!limited.allowed) {
      throw new RateLimitedError("Too many events.", limited.retryAfterMs);
    }

    const body = collectEventSchema.parse(await request.json());
    await recordEvent(body);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
