import { NextResponse, type NextRequest } from "next/server";

// Phase 6: {slug}.BASE_DOMAIN -> /p/{slug}. Reads env directly (not
// src/lib/env.ts, which imports server-only code Prisma-adjacent — the Zod
// schema there validates DATABASE_URL etc. that Edge proxy code never
// needs). Only active once BASE_DOMAIN is configured; there's no real
// domain in this dev environment; /p/[slug] always works directly either
// way.
const BASE_DOMAIN = process.env.BASE_DOMAIN;

export function proxy(request: NextRequest) {
  if (!BASE_DOMAIN) return NextResponse.next();

  const host = request.headers.get("host") ?? "";
  const hostname = host.split(":")[0];

  if (hostname === BASE_DOMAIN || hostname === `www.${BASE_DOMAIN}`) {
    return NextResponse.next();
  }

  if (hostname.endsWith(`.${BASE_DOMAIN}`)) {
    const slug = hostname.slice(0, -(`.${BASE_DOMAIN}`.length));
    const url = request.nextUrl.clone();
    url.pathname = `/p/${slug}${url.pathname === "/" ? "" : url.pathname}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|api|favicon.ico).*)"],
};
