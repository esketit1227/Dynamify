import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { getVisitorDetail } from "@/lib/visitors/dsr";
import { toErrorResponse } from "@/lib/api/respond";

// The dashboard's own row-expand view — deliberately not audit-logged
// (see getVisitorDetail's comment): a merchant browsing their own
// Visitors page isn't a data-subject-rights export. That's the sibling
// GET at .../visitors/[visitorId] (exportVisitorData), a distinct,
// explicit action.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string; visitorId: string }> },
) {
  try {
    const { organizationId, visitorId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const detail = await getVisitorDetail(organization.id, visitorId);
    return NextResponse.json(detail);
  } catch (error) {
    return toErrorResponse(error);
  }
}
