import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { publishPage } from "@/lib/pages/service";
import { toErrorResponse } from "@/lib/api/respond";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string; pageId: string }> },
) {
  try {
    const { organizationId, pageId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const page = await publishPage(organization.id, pageId);
    return NextResponse.json({ page });
  } catch (error) {
    return toErrorResponse(error);
  }
}
