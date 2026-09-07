import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { endorsePageDesign } from "@/lib/sites/designPage";
import { toErrorResponse } from "@/lib/api/respond";

// Touches only PageDesign.status — see docs/decisions.md D8. Endorsing
// records that the customer likes this direction; it never publishes
// anything and creates no Audience/rule/variant/experience row.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string; pageDesignId: string }> },
) {
  try {
    const { organizationId, pageDesignId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const design = await endorsePageDesign(organization.id, pageDesignId);
    return NextResponse.json({ design });
  } catch (error) {
    return toErrorResponse(error);
  }
}
