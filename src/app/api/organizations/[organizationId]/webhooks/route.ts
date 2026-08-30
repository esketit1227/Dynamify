import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { listWebhooks, createWebhook } from "@/lib/integrations/service";
import { createWebhookSchema } from "@/lib/validation/integrations";
import { toErrorResponse } from "@/lib/api/respond";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const webhooks = await listWebhooks(organization.id);
    return NextResponse.json({ webhooks });
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
    const body = createWebhookSchema.parse(await request.json());
    const webhook = await createWebhook(organization.id, body.url, body.eventTypes);
    return NextResponse.json({ webhook }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
