import { NextResponse } from "next/server";
import { passwordResetRequestSchema } from "@/lib/validation/auth";
import { requestPasswordReset } from "@/lib/auth/service";
import { rateLimit, clientIpFromRequest } from "@/lib/auth/rateLimit";
import { RateLimitedError } from "@/lib/auth/errors";
import { toErrorResponse } from "@/lib/api/respond";
import { originFromHeaders } from "@/lib/http/origin";

// Always responds 200 with the same generic message, whether or not the
// email belongs to an account — an attacker probing emails learns nothing.
const GENERIC_RESPONSE = {
  ok: true,
  message: "If an account exists for that email, a reset link has been sent.",
};

export async function POST(request: Request) {
  try {
    const body = passwordResetRequestSchema.parse(await request.json());

    const ip = clientIpFromRequest(request);
    const limited = await rateLimit(`password-reset-request:${ip}:${body.email}`, {
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });
    if (!limited.allowed) {
      throw new RateLimitedError("Too many requests. Try again later.", limited.retryAfterMs);
    }

    await requestPasswordReset(body.email, originFromHeaders(request.headers));

    return NextResponse.json(GENERIC_RESPONSE);
  } catch (error) {
    return toErrorResponse(error);
  }
}
