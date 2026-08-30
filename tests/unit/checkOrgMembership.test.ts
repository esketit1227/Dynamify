import { describe, it, expect, afterEach } from "vitest";
import { checkOrgMembership } from "@/lib/auth/requireOrgAccess";
import { OrgAccessError } from "@/lib/auth/errors";
import { resetDb } from "../setup/reset";
import { createOrgWithUser } from "../setup/factories";

afterEach(async () => {
  await resetDb();
});

describe("checkOrgMembership", () => {
  it("resolves the organization for a member", async () => {
    const { organization, user } = await createOrgWithUser();

    const result = await checkOrgMembership(user.id, organization.id);

    expect(result.organization.id).toBe(organization.id);
    expect(result.role).toBe("OWNER");
  });

  it("throws OrgAccessError (404) for a user who isn't a member", async () => {
    const { organization } = await createOrgWithUser();
    const { user: outsider } = await createOrgWithUser();

    await expect(checkOrgMembership(outsider.id, organization.id)).rejects.toThrow(
      OrgAccessError,
    );
  });

  it("throws the same OrgAccessError for a nonexistent organization", async () => {
    const { user } = await createOrgWithUser();

    const error = await checkOrgMembership(user.id, "nonexistent-org-id").catch((e) => e);

    expect(error).toBeInstanceOf(OrgAccessError);
    expect(error.status).toBe(404);
  });
});
