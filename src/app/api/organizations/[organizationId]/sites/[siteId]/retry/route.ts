import { NextResponse, after } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { getSite, runCrawlAndUnderstand } from "@/lib/sites/service";
import { rateLimit } from "@/lib/auth/rateLimit";
import { RateLimitedError } from "@/lib/auth/errors";
import { toErrorResponse } from "@/lib/api/respond";
import { prisma } from "@/lib/db";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string; siteId: string }> },
) {
  try {
    const { organizationId, siteId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    await getSite(organization.id, siteId); // 404s if not this org's site

    const limited = await rateLimit(`sites:retry:${organization.id}`, {
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });
    if (!limited.allowed) {
      throw new RateLimitedError("Too many retries recently. Try again later.", limited.retryAfterMs);
    }

    await prisma.site.update({
      where: { id: siteId },
      data: { status: "PENDING", errorMessage: null },
    });
    // Same serverless-teardown fix as createSite() (src/lib/sites/service.ts)
    // — a bare `void` fire-and-forget can be cut off mid-crawl on Vercel.
    after(() => runCrawlAndUnderstand(siteId).catch(() => {}));

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
