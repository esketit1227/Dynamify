import { NextResponse } from "next/server";
import type { VisitorContext } from "@dynamify/personalization-sdk";
import { getEmbedElements, type ConsentState } from "@/lib/embed/service";
import { geoFromHeaders } from "@/lib/visitors/service";
import { rateLimit, clientIpFromRequest } from "@/lib/auth/rateLimit";

// Public, cross-origin endpoint — called by public/dynamify-embed.js from
// whatever domain a customer installed it on, not from our own dashboard.
// This is the only route in the app that gets CORS headers; do not add
// them anywhere else as a side effect of touching this file. No
// credentials are ever involved here, so `*` is the correct, safe origin
// value — never pair this with Access-Control-Allow-Credentials.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const DEVICES = new Set(["desktop", "mobile", "tablet", "unknown"]);
// Same cap as the events route's visitorKey/loadToken fields — this is
// just shape, not the actual gate (getEmbedElements ignores visitorKey
// unless the site has visitor tracking enabled, and loadToken only ever
// matters when the site is running a holdout experiment).
const MAX_ID_LENGTH = 100;

function capId(raw: string | null): string | undefined {
  return raw && raw.length > 0 && raw.length <= MAX_ID_LENGTH ? raw : undefined;
}

// GET has no body, so consent travels as query params — "1" means
// granted, anything else (including absent) means not granted. Defaults
// to necessary-only (docs/visitor-data.md's stated default posture)
// whenever the params are absent, e.g. an older cached embed script or a
// direct request with nothing set.
function parseConsent(searchParams: URLSearchParams): ConsentState {
  return {
    necessary: true,
    analytics: searchParams.get("consentAnalytics") === "1",
    personalization: searchParams.get("consentPersonalization") === "1",
  };
}

// Flat query params, not the nested visitorContextSchema shape — this is a
// narrow contract with our own embed script (which can only read a few
// page-native signals; see docs/roadmap.md Phase 3's deliberately reduced
// scope), not a generic public input surface. Still capped/sanitized since
// it's unauthenticated and could receive anything.
function parseContext(searchParams: URLSearchParams): VisitorContext | undefined {
  const cap = (v: string | null) => (v ? v.slice(0, 200) : undefined);

  const device = searchParams.get("device");
  const referrer = cap(searchParams.get("referrer"));
  const utmSource = cap(searchParams.get("utmSource"));
  const utmMedium = cap(searchParams.get("utmMedium"));
  const utmCampaign = cap(searchParams.get("utmCampaign"));
  const utmTerm = cap(searchParams.get("utmTerm"));
  const utmContent = cap(searchParams.get("utmContent"));

  const hasAny = device || referrer || utmSource || utmMedium || utmCampaign || utmTerm || utmContent;
  if (!hasAny) return undefined;

  return {
    device: device && DEVICES.has(device) ? (device as VisitorContext["device"]) : undefined,
    referrer,
    utm:
      utmSource || utmMedium || utmCampaign || utmTerm || utmContent
        ? { source: utmSource, medium: utmMedium, campaign: utmCampaign, term: utmTerm, content: utmContent }
        : undefined,
  };
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  // Rate-limited per CLAUDE.md's "rate limit... public collection
  // endpoints" — real visitor traffic is expected and fine, scripted
  // abuse at volume isn't.
  const limited = await rateLimit(`embed-elements:${clientIpFromRequest(request)}`, {
    limit: 60,
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

  const { siteId } = await params;
  const searchParams = new URL(request.url).searchParams;
  const url = searchParams.get("url");
  if (!url) {
    return NextResponse.json({ elements: [], visitorTrackingEnabled: false }, { headers: CORS_HEADERS });
  }

  try {
    const context = parseContext(searchParams);
    const visitorKey = capId(searchParams.get("visitorKey"));
    const loadToken = capId(searchParams.get("loadToken"));
    const { elements, cacheable, visitorTrackingEnabled } = await getEmbedElements(
      siteId,
      url,
      context,
      clientIpFromRequest(request),
      visitorKey,
      loadToken,
      parseConsent(searchParams),
      geoFromHeaders(request.headers),
    );
    // Only cacheable when the response can't vary by the visitor's IP
    // (Phase 6 firmographic enrichment), their own tracked behavior
    // (behavioral targeting), or a running holdout experiment —
    // device/UTM/referrer are already part of this URL's query string, so
    // they don't have this problem, but an IP-derived company, a
    // visitor's real stage/intentScore, or a per-visitor coin flip does.
    // See src/lib/embed/service.ts's EmbedElementsResult for the full reasoning.
    const headers = cacheable
      ? { ...CORS_HEADERS, "Cache-Control": "public, max-age=300" }
      : CORS_HEADERS;
    return NextResponse.json({ elements, visitorTrackingEnabled }, { headers });
  } catch (error) {
    // Never let an unexpected failure surface as a CORS-less 500 — a
    // response missing these headers is invisible to the calling script
    // anyway (the browser blocks it before JS ever sees it), so failing
    // this safely just means "nothing to verify" rather than a console
    // error on the customer's own site.
    console.error("embed elements error:", error);
    return NextResponse.json(
      { elements: [], visitorTrackingEnabled: false },
      { status: 200, headers: CORS_HEADERS },
    );
  }
}
