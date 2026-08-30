import { NextResponse } from "next/server";
import { loginSchema } from "@/lib/validation/auth";
import { login } from "@/lib/auth/service";
import { setSessionCookie } from "@/lib/auth/session";
import { rateLimit, clientIpFromRequest } from "@/lib/auth/rateLimit";
import { RateLimitedError } from "@/lib/auth/errors";
import { toErrorResponse } from "@/lib/api/respond";

export async function POST(request: Request) {
  try {
    const body = loginSchema.parse(await request.json());

    // Keyed by IP + email so one attacker can't lock out a real user by
    // hammering their email from many IPs faster than the IP limit alone
    // would catch, while a single IP is still capped independent of email.
    const ip = clientIpFromRequest(request);
    const [limitedByIp, limitedByEmail] = await Promise.all([
      rateLimit(`login:ip:${ip}`, { limit: 20, windowMs: 15 * 60 * 1000 }),
      rateLimit(`login:email:${body.email}`, { limit: 10, windowMs: 15 * 60 * 1000 }),
    ]);
    if (!limitedByIp.allowed || !limitedByEmail.allowed) {
      const retryAfterMs = Math.max(
        limitedByIp.allowed ? 0 : limitedByIp.retryAfterMs,
        limitedByEmail.allowed ? 0 : limitedByEmail.retryAfterMs,
      );
      throw new RateLimitedError("Too many login attempts. Try again later.", retryAfterMs);
    }

    const session = await login(body);
    await setSessionCookie(session);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
