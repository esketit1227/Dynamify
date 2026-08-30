import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { deleteWebhook } from "@/lib/integrations/service";
import { toErrorResponse } from "@/lib/api/respond";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string; webhookId: string }> },
) {
  try {
    const { organizationId, webhookId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    await deleteWebhook(organization.id, webhookId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
