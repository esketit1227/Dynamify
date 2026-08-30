import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { exportVisitorData, deleteVisitorData } from "@/lib/visitors/dsr";
import { toErrorResponse } from "@/lib/api/respond";

type Params = { params: Promise<{ organizationId: string; visitorId: string }> };

// docs/visitor-data.md: "Export: all data for a visitor ID or email,
// machine-readable, within 30 days... Expose them as API endpoints and
// as buttons in the merchant dashboard." The merchant (an authenticated
// org member) is the one calling this, actioning the request on their
// own visitor's behalf — "We are a processor; the merchant is the
// controller."
export async function GET(_request: Request, { params }: Params) {
  try {
    const { organizationId, visitorId } = await params;
    const { organization, user } = await requireOrgAccess(organizationId);
    const data = await exportVisitorData(organization.id, visitorId, user.id);
    return NextResponse.json(data);
  } catch (error) {
    return toErrorResponse(error);
  }
}

// docs/visitor-data.md: "Delete: hard delete across all tables,
// cascading, including the queue."
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { organizationId, visitorId } = await params;
    const { organization, user } = await requireOrgAccess(organizationId);
    await deleteVisitorData(organization.id, visitorId, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
