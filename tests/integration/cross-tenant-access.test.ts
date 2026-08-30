import { describe, it, expect, afterEach } from "vitest";
import { checkOrgMembership } from "@/lib/auth/requireOrgAccess";
import { OrgAccessError } from "@/lib/auth/errors";
import { listPages } from "@/lib/pages/service";
import { resetDb } from "../setup/reset";
import { createOrgWithUser, createPage } from "../setup/factories";

afterEach(async () => {
  await resetDb();
});

// The Phase 0 exit criterion: a second user cannot read or mutate the first
// user's org data. This exercises the same authorize -> service pipeline
// GET /api/organizations/[organizationId]/pages runs — see
// src/app/api/organizations/[organizationId]/pages/route.ts.
describe("cross-tenant isolation", () => {
  it("returns 404, not data, when a member of org A requests org B", async () => {
    const { organization: orgA, user: userA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();
    const orgBPage = await createPage(orgB.id);

    const error = await checkOrgMembership(userA.id, orgB.id).catch((e) => e);

    expect(error).toBeInstanceOf(OrgAccessError);
    expect(error.status).toBe(404);
    // The error carries no org B data — not the page name, not its id.
    expect(JSON.stringify(error)).not.toContain(orgBPage.name);
    expect(JSON.stringify(error)).not.toContain(orgBPage.id);

    // orgA's own membership still resolves fine — this isn't a blanket failure.
    await expect(checkOrgMembership(userA.id, orgA.id)).resolves.toBeDefined();
  });

  it("returns the identical 404 for a nonexistent org as for someone else's org", async () => {
    const { organization: orgB } = await createOrgWithUser();
    const { user: userA } = await createOrgWithUser();

    const realOrgError = await checkOrgMembership(userA.id, orgB.id).catch((e) => e);
    const fakeOrgError = await checkOrgMembership(userA.id, "does-not-exist").catch((e) => e);

    expect(realOrgError.status).toBe(fakeOrgError.status);
    expect(realOrgError.message).toBe(fakeOrgError.message);
  });

  it("never leaks org B's pages into org A's listing", async () => {
    const { organization: orgA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();
    await createPage(orgB.id);
    const pageA = await createPage(orgA.id);

    const pages = await listPages(orgA.id);

    expect(pages).toHaveLength(1);
    expect(pages[0].id).toBe(pageA.id);
  });
});
