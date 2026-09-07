import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { listPageDesignCandidates, generateNewPageDesign } from "@/lib/sites/designPage";
import { toErrorResponse } from "@/lib/api/respond";

// Up to three sequential Anthropic calls per generation (market context,
// design, fact-check) — same reasoning as sites/route.ts's own maxDuration.
export const maxDuration = 60;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const candidates = await listPageDesignCandidates(organization.id);
    return NextResponse.json({ candidates });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const bodySchema = z.object({ crawledPageId: z.string().min(1) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const body = bodySchema.parse(await request.json());
    const design = await generateNewPageDesign(organization.id, body.crawledPageId);
    return NextResponse.json({ design });
  } catch (error) {
    return toErrorResponse(error);
  }
}
