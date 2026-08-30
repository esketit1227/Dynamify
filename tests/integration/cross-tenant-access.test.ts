import { describe, it, expect, afterEach } from "vitest";
import { checkOrgMembership } from "@/lib/auth/requireOrgAccess";
import { OrgAccessError } from "@/lib/auth/errors";
import { resetDb } from "../setup/reset";
import { createOrgWithUser } from "../setup/factories";

afterEach(async () => {
  await resetDb();
});

// The Phase 0 exit criterion: a second user cannot read or mutate the
// first user's org data. Every route under
// /api/organizations/[organizationId]/** runs through this same
// authorize step before touching any resource-specific service.
describe("cross-tenant isolation", () => {
  it("returns 404, not data, when a member of org A requests org B", async () => {
    const { organization: orgA, user: userA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();

    const error = await checkOrgMembership(userA.id, orgB.id).catch((e) => e);

    expect(error).toBeInstanceOf(OrgAccessError);
    expect(error.status).toBe(404);
    // The error carries none of org B's own data — not its name, not its slug.
    expect(JSON.stringify(error)).not.toContain(orgB.name);
    expect(JSON.stringify(error)).not.toContain(orgB.slug);

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
});
