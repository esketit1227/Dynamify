import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { deleteSite, SiteNotFoundError } from "@/lib/sites/service";
import { resetDb } from "../setup/reset";
import { createOrgWithUser } from "../setup/factories";

afterEach(async () => {
  await resetDb();
});

// docs/visitor-data.md: "remove this site" has to actually mean the
// site's real visitor data is gone too — SiteVisitor has no relation
// back to Site in the schema (siteId is a bare denormalized field), so
// without an explicit delete it would silently survive the site's own
// removal. This is the regression that matters most here: not that the
// Site row disappears (trivial), but that nothing it left behind does.
describe("deleteSite", () => {
  async function seedSiteWithVisitor(organizationId: string) {
    const site = await prisma.site.create({
      data: { organizationId, url: "https://example.com", status: "READY" },
    });
    const page = await prisma.crawledPage.create({
      data: { siteId: site.id, organizationId, url: "https://example.com" },
    });
    const element = await prisma.contentElement.create({
      data: {
        crawledPageId: page.id,
        organizationId,
        section: "HERO",
        elementType: "HEADLINE",
        selector: "h1",
        currentContent: "Welcome",
        order: 0,
      },
    });
    const visitor = await prisma.siteVisitor.create({
      data: { organizationId, siteId: site.id, visitorKey: "visitor-key-1" },
    });
    const session = await prisma.visitorSession.create({
      data: { organizationId, visitorId: visitor.id },
    });
    return { site, page, element, visitor, session };
  }

  it("removes the site and everything crawled from it", async () => {
    const { organization, user } = await createOrgWithUser();
    const { site, page, element } = await seedSiteWithVisitor(organization.id);

    await deleteSite(organization.id, site.id, user.id);

    expect(await prisma.site.findUnique({ where: { id: site.id } })).toBeNull();
    expect(await prisma.crawledPage.findUnique({ where: { id: page.id } })).toBeNull();
    expect(await prisma.contentElement.findUnique({ where: { id: element.id } })).toBeNull();
  });

  it("also removes the site's real visitor data — SiteVisitor and everything under it", async () => {
    const { organization, user } = await createOrgWithUser();
    const { site, visitor, session } = await seedSiteWithVisitor(organization.id);

    await deleteSite(organization.id, site.id, user.id);

    expect(await prisma.siteVisitor.findUnique({ where: { id: visitor.id } })).toBeNull();
    expect(await prisma.visitorSession.findUnique({ where: { id: session.id } })).toBeNull();
  });

  it("never touches another site's visitors", async () => {
    const { organization, user } = await createOrgWithUser();
    const { site: siteA } = await seedSiteWithVisitor(organization.id);
    const { visitor: visitorB } = await seedSiteWithVisitor(organization.id);

    await deleteSite(organization.id, siteA.id, user.id);

    expect(await prisma.siteVisitor.findUnique({ where: { id: visitorB.id } })).not.toBeNull();
  });

  it("writes an audit log entry", async () => {
    const { organization, user } = await createOrgWithUser();
    const { site } = await seedSiteWithVisitor(organization.id);

    await deleteSite(organization.id, site.id, user.id);

    const logged = await prisma.auditLog.findFirst({
      where: { organizationId: organization.id, action: "site.delete", targetId: site.id },
    });
    expect(logged).not.toBeNull();
    expect(logged?.actorUserId).toBe(user.id);
    expect(logged?.targetType).toBe("Site");
  });

  it("throws SiteNotFoundError for a nonexistent site and writes no audit entry", async () => {
    const { organization, user } = await createOrgWithUser();

    await expect(deleteSite(organization.id, "nonexistent-id", user.id)).rejects.toThrow(SiteNotFoundError);

    const logged = await prisma.auditLog.findFirst({
      where: { organizationId: organization.id, action: "site.delete" },
    });
    expect(logged).toBeNull();
  });
});
