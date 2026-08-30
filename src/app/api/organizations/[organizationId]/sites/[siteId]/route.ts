import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import {
  getSite,
  deleteSite,
  setIpEnrichmentEnabled,
  setVisitorTrackingEnabled,
  setHoldbackPercent,
  setAutoApproveAiContent,
} from "@/lib/sites/service";
import { updateSiteSchema } from "@/lib/validation/sites";
import { toErrorResponse } from "@/lib/api/respond";
import { HttpError } from "@/lib/auth/errors";
import type { SiteDTO } from "@/lib/sites/dto";

type Params = { params: Promise<{ organizationId: string; siteId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { organizationId, siteId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const site = await getSite(organization.id, siteId);
    return NextResponse.json({ site });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { organizationId, siteId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const body = updateSiteSchema.parse(await request.json());
    // Each call sets exactly one toggle in practice (two independent
    // checkboxes on the Sites page) — applied sequentially so a request
    // that somehow carried both still lands correctly either way.
    let site: SiteDTO | null = null;
    if (body.ipEnrichmentEnabled !== undefined) {
      site = await setIpEnrichmentEnabled(organization.id, siteId, body.ipEnrichmentEnabled);
    }
    if (body.visitorTrackingEnabled !== undefined) {
      site = await setVisitorTrackingEnabled(organization.id, siteId, body.visitorTrackingEnabled);
    }
    if (body.holdbackPercent !== undefined) {
      site = await setHoldbackPercent(organization.id, siteId, body.holdbackPercent);
    }
    if (body.autoApproveAiContent !== undefined) {
      site = await setAutoApproveAiContent(organization.id, siteId, body.autoApproveAiContent);
    }
    if (!site) throw new HttpError(400, "No fields to update");
    return NextResponse.json({ site });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { organizationId, siteId } = await params;
    const { organization, user } = await requireOrgAccess(organizationId);
    await deleteSite(organization.id, siteId, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
