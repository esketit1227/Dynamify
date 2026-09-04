import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { listSites, createSite } from "@/lib/sites/service";
import { createSiteSchema } from "@/lib/validation/sites";
import { rateLimit } from "@/lib/auth/rateLimit";
import { RateLimitedError } from "@/lib/auth/errors";
import { toErrorResponse } from "@/lib/api/respond";

// createSite() kicks off a real crawl (up to ~60s, per its own comment) +
// an AI understanding call via after() — Vercel's platform default
// function timeout (10s on Hobby) is far shorter than that regardless of
// after(), which only keeps the invocation alive past the response, not
// past its own duration limit. Without this, a real multi-page site gets
// killed mid-crawl and lands on the generic FAILED message every time.
export const maxDuration = 60;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const sites = await listSites(organization.id);
    return NextResponse.json({ sites });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await params;
    const { organization } = await requireOrgAccess(organizationId);

    // Crawling is resource-intensive (real outbound HTTP to a third party
    // plus an AI call) — rate limit site creation per org, same discipline
    // as the AI endpoints.
    const limited = await rateLimit(`sites:create:${organization.id}`, {
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });
    if (!limited.allowed) {
      throw new RateLimitedError("Too many sites connected recently. Try again later.", limited.retryAfterMs);
    }

    const body = createSiteSchema.parse(await request.json());
    const site = await createSite(organization.id, body.url);
    return NextResponse.json({ site }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
