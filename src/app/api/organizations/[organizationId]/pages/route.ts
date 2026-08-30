import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { listPages, createPage } from "@/lib/pages/service";
import { createPageSchema } from "@/lib/validation/pages";
import { toErrorResponse } from "@/lib/api/respond";

// authorize -> validate -> call service -> shape response.
// The pattern every tenant-scoped handler follows (CLAUDE.md).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await params;

    // authorize: resolves the session and verifies membership; throws 401/404
    const { organization } = await requireOrgAccess(organizationId);

    // validate: no body on GET — organizationId came from the path and was
    // just checked against the session above, never trusted on its own.

    // call service
    const pages = await listPages(organization.id);

    // shape response: PageDTO[] only, no internal fields
    return NextResponse.json({ pages });
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
    const body = createPageSchema.parse(await request.json());
    const page = await createPage(organization.id, body);
    return NextResponse.json({ page }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
