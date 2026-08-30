import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { recordSiteEvent } from "@/lib/embed/service";
import { visitorContextSchema } from "@/lib/validation/visitorContext";
import { rateLimit, clientIpFromRequest } from "@/lib/auth/rateLimit";
import { geoFromHeaders } from "@/lib/visitors/service";

// docs/visitor-data.md's Consent architecture. Defaults to
// necessary-only whenever absent (an older cached embed script, or any
// direct caller that sends nothing) — the doc's stated default posture.
const consentSchema = z
  .object({
    necessary: z.boolean().default(true),
    analytics: z.boolean().default(false),
    personalization: z.boolean().default(false),
  })
  .default({ necessary: true, analytics: false, personalization: false });

// Public, cross-origin endpoint — the second and last route in the app
// that gets CORS headers, alongside .../elements (see that file's comment;
// the same reasoning applies here verbatim, do not add CORS elsewhere).
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const bodySchema = z
  .object({
    url: z.string().max(2000),
    context: visitorContextSchema,
    type: z.enum(["PAGE_VIEW", "CTA_CLICK"]).default("PAGE_VIEW"),
    // Which ContentElement was clicked — required for CTA_CLICK, ignored
    // otherwise. recordSiteEvent re-validates this belongs to the
    // resolved page before trusting it for anything; this is just shape.
    contentElementId: z.string().min(1).max(64).optional(),
    // The embed script's dynamify_vid cookie value, sent only when the
    // site has visitor tracking enabled. recordSiteEvent ignores this
    // entirely unless the site itself has opted in — this is just shape,
    // not the actual gate.
    visitorKey: z.string().min(1).max(100).optional(),
    // A fresh id the embed script mints once per page load — the holdout
    // seed (src/lib/experiments/holdout.ts) for anonymous traffic that
    // has no visitorKey. Only ever matters on a site running a holdout
    // experiment; recordSiteEvent recomputes the holdout decision itself
    // rather than trusting a client-asserted outcome.
    loadToken: z.string().min(1).max(100).optional(),
    consent: consentSchema,
  })
  .refine((body) => body.type !== "CTA_CLICK" || body.contentElementId !== undefined, {
    message: "contentElementId is required for a CTA_CLICK event",
    path: ["contentElementId"],
  });

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  // Rate-limited per CLAUDE.md's "rate limit... public collection
  // endpoints" — one real visitor firing one beacon per page load is
  // expected and fine; scripted abuse at volume isn't.
  const limited = await rateLimit(`embed-events:${clientIpFromRequest(request)}`, {
    limit: 120,
    windowMs: 60 * 1000,
  });
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Too many requests." },
      {
        status: 429,
        headers: { ...CORS_HEADERS, "Retry-After": Math.ceil(limited.retryAfterMs / 1000).toString() },
      },
    );
  }

  try {
    const { siteId } = await params;
    const body = bodySchema.parse(await request.json());
    const options =
      body.type === "CTA_CLICK"
        ? ({ type: "CTA_CLICK", contentElementId: body.contentElementId! } as const)
        : undefined;
    await recordSiteEvent(
      siteId,
      body.url,
      body.context,
      clientIpFromRequest(request),
      options,
      body.visitorKey,
      body.loadToken,
      body.consent,
      geoFromHeaders(request.headers),
    );
    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
  } catch (error) {
    // Same posture as .../elements: never a CORS-less error response (the
    // browser would just block it before the script ever saw it anyway),
    // and a beacon that failed to record is not something the host page
    // should ever know about.
    if (!(error instanceof ZodError)) console.error("embed events error:", error);
    return NextResponse.json({ ok: false }, { status: 200, headers: CORS_HEADERS });
  }
}
