import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { seedDefaultAudiences } from "@/lib/audiences/service";
import { resetDb } from "../setup/reset";
import { createOrgWithUser } from "../setup/factories";

afterEach(async () => {
  await resetDb();
});

// Cold-start (docs/roadmap.md Hardening): removes the blank-Audiences-page
// friction on a brand-new site — see src/lib/sites/service.ts's
// runCrawlAndUnderstand, which calls this once a site's first crawl
// succeeds.
describe("seedDefaultAudiences", () => {
  it("creates starter audiences for an org with none", async () => {
    const { organization } = await createOrgWithUser();

    await seedDefaultAudiences(organization.id);

    const audiences = await prisma.audience.findMany({ where: { organizationId: organization.id } });
    expect(audiences).toHaveLength(3);
    expect(audiences.map((a) => a.name).sort()).toEqual(["Mobile visitors", "New visitors", "Returning visitors"]);
  });

  it("gives each starter audience exactly one real, matchable rule", async () => {
    const { organization } = await createOrgWithUser();

    await seedDefaultAudiences(organization.id);

    const audiences = await prisma.audience.findMany({
      where: { organizationId: organization.id },
      include: { rules: true },
    });
    for (const audience of audiences) {
      expect(audience.rules).toHaveLength(1);
      expect(audience.rules[0].operator).toBe("EQUALS");
    }
  });

  it("is a no-op when the org already has any audience", async () => {
    const { organization } = await createOrgWithUser();
    await prisma.audience.create({ data: { organizationId: organization.id, name: "Hand-built audience" } });

    await seedDefaultAudiences(organization.id);

    const audiences = await prisma.audience.findMany({ where: { organizationId: organization.id } });
    expect(audiences).toHaveLength(1);
    expect(audiences[0].name).toBe("Hand-built audience");
  });

  it("never seeds another organization's audiences", async () => {
    const { organization: orgA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();

    await seedDefaultAudiences(orgA.id);

    const audiencesForB = await prisma.audience.findMany({ where: { organizationId: orgB.id } });
    expect(audiencesForB).toEqual([]);
  });

  it("calling it twice on a fresh org still only produces one set of starters", async () => {
    const { organization } = await createOrgWithUser();

    await seedDefaultAudiences(organization.id);
    await seedDefaultAudiences(organization.id);

    const audiences = await prisma.audience.findMany({ where: { organizationId: organization.id } });
    expect(audiences).toHaveLength(3);
  });
});
