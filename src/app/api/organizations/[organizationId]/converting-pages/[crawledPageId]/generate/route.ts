import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { generateConvertingPage } from "@/lib/recommendations/convertingPages";
import { toErrorResponse } from "@/lib/api/respond";

// Generates an AI-rewritten, conversion-focused experience for one crawled
// page from crawl data alone — no Recommendation row, no traffic, no
// audience picker. See convertingPages.ts for why "Mobile visitors" is the
// one segment this always targets.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string; crawledPageId: string }> },
) {
  try {
    const { organizationId, crawledPageId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const experience = await generateConvertingPage(organization.id, crawledPageId);
    return NextResponse.json({ experience });
  } catch (error) {
    return toErrorResponse(error);
  }
}
