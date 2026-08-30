import { NextResponse } from "next/server";
import { signupSchema } from "@/lib/validation/auth";
import { signup } from "@/lib/auth/service";
import { setSessionCookie } from "@/lib/auth/session";
import { rateLimit, clientIpFromRequest } from "@/lib/auth/rateLimit";
import { RateLimitedError } from "@/lib/auth/errors";
import { toErrorResponse } from "@/lib/api/respond";

export async function POST(request: Request) {
  try {
    const limited = await rateLimit(`signup:${clientIpFromRequest(request)}`, {
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });
    if (!limited.allowed) {
      throw new RateLimitedError("Too many signup attempts. Try again later.", limited.retryAfterMs);
    }

    const body = signupSchema.parse(await request.json());
    const session = await signup(body);
    await setSessionCookie(session);

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
