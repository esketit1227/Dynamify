import { NextResponse } from "next/server";
import { passwordResetConfirmSchema } from "@/lib/validation/auth";
import { confirmPasswordReset } from "@/lib/auth/service";
import { rateLimit, clientIpFromRequest } from "@/lib/auth/rateLimit";
import { RateLimitedError } from "@/lib/auth/errors";
import { toErrorResponse } from "@/lib/api/respond";

export async function POST(request: Request) {
  try {
    const body = passwordResetConfirmSchema.parse(await request.json());

    const ip = clientIpFromRequest(request);
    const limited = await rateLimit(`password-reset-confirm:${ip}`, {
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });
    if (!limited.allowed) {
      throw new RateLimitedError("Too many requests. Try again later.", limited.retryAfterMs);
    }

    await confirmPasswordReset(body.token, body.password);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
