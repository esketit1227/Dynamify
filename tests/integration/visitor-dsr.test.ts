import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { getVisitorDetail, exportVisitorData, deleteVisitorData, SiteVisitorNotFoundError } from "@/lib/visitors/dsr";
import { recordSiteEvent, type ConsentState } from "@/lib/embed/service";
import { resetDb } from "../setup/reset";
import { createOrgWithUser } from "../setup/factories";

afterEach(async () => {
  await resetDb();
});

const TRACKED: ConsentState = { necessary: true, analytics: true, personalization: true };

async function seedTrackedVisitor(organizationId: string) {
  const site = await prisma.site.create({
    data: { organizationId, url: "https://example.com", status: "READY", visitorTrackingEnabled: true },
  });
  const page = await prisma.crawledPage.create({
    data: { siteId: site.id, organizationId, url: "https://example.com/", title: "Home" },
  });
  await prisma.contentElement.create({
    data: {
      crawledPageId: page.id,
      organizationId,
      section: "HERO",
      elementType: "HEADLINE",
      selector: "h1",
      currentContent: "Real headline",
      order: 0,
    },
  });
  await recordSiteEvent(
    site.id,
    "https://example.com",
    { device: "mobile" },
    undefined,
    undefined,
    "visitor-1",
    undefined,
    TRACKED,
  );
  const visitor = await prisma.siteVisitor.findFirstOrThrow({ where: { siteId: site.id } });
  return { site, page, visitor };
}

// docs/visitor-data.md's Data subject rights section.
describe("getVisitorDetail / exportVisitorData", () => {
  it("returns the visitor's real session history", async () => {
    const { organization } = await createOrgWithUser();
    const { visitor } = await seedTrackedVisitor(organization.id);

    const detail = await getVisitorDetail(organization.id, visitor.id);
    expect(detail.visitor.visitorKey).toBe("visitor-1");
    expect(detail.sessions).toHaveLength(1);
    expect(detail.sessions[0].pageViewCount).toBe(1);
  });

  it("throws for a visitor in another organization", async () => {
    const { organization: orgA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();
    const { visitor } = await seedTrackedVisitor(orgB.id);

    await expect(getVisitorDetail(orgA.id, visitor.id)).rejects.toThrow(SiteVisitorNotFoundError);
  });

  it("logs an audit entry on export, but getVisitorDetail alone does not", async () => {
    const { organization, user } = await createOrgWithUser();
    const { visitor } = await seedTrackedVisitor(organization.id);

    await getVisitorDetail(organization.id, visitor.id);
    const beforeExport = await prisma.auditLog.count({ where: { organizationId: organization.id } });
    expect(beforeExport).toBe(0);

    await exportVisitorData(organization.id, visitor.id, user.id);
    const afterExport = await prisma.auditLog.findMany({ where: { organizationId: organization.id } });
    expect(afterExport).toHaveLength(1);
    expect(afterExport[0]).toMatchObject({ action: "visitor.export", targetId: visitor.id, actorUserId: user.id });
  });
});

describe("deleteVisitorData", () => {
  it("hard-deletes the visitor and cascades to its session/impressions/conversions/events", async () => {
    const { organization, user } = await createOrgWithUser();
    const { site, visitor } = await seedTrackedVisitor(organization.id);
    const session = await prisma.visitorSession.findFirstOrThrow({ where: { visitorId: visitor.id } });

    await deleteVisitorData(organization.id, visitor.id, user.id);

    expect(await prisma.siteVisitor.findUnique({ where: { id: visitor.id } })).toBeNull();
    expect(await prisma.visitorSession.findUnique({ where: { id: session.id } })).toBeNull();
    expect(await prisma.siteEvent.findMany({ where: { siteId: site.id } })).toEqual([]);

    const auditRows = await prisma.auditLog.findMany({ where: { organizationId: organization.id } });
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].action).toBe("visitor.delete");
  });

  it("org A cannot delete org B's visitor", async () => {
    const { organization: orgA, user: userA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();
    const { visitor } = await seedTrackedVisitor(orgB.id);

    await expect(deleteVisitorData(orgA.id, visitor.id, userA.id)).rejects.toThrow(SiteVisitorNotFoundError);

    expect(await prisma.siteVisitor.findUnique({ where: { id: visitor.id } })).not.toBeNull();
  });
});

// Caught via live verification, not by inspection: the first version
// recorded an Impression from *every* event's resolve() call, including
// CTA_CLICK — so a page view followed by a click on that same,
// already-rendered page double-counted every personalized element as
// having been "shown" twice, when the visitor only ever saw it once.
describe("Impression recording — only on PAGE_VIEW, never doubled by a later CTA_CLICK", () => {
  it("records impressions once on the page view and does not record them again on a click", async () => {
    const { organization } = await createOrgWithUser();
    const site = await prisma.site.create({
      data: { organizationId: organization.id, url: "https://example.com", status: "READY", visitorTrackingEnabled: true },
    });
    const page = await prisma.crawledPage.create({
      data: { siteId: site.id, organizationId: organization.id, url: "https://example.com/" },
    });
    const element = await prisma.contentElement.create({
      data: {
        crawledPageId: page.id,
        organizationId: organization.id,
        section: "HERO",
        elementType: "HEADLINE",
        selector: "h1",
        currentContent: "Real headline",
        order: 0,
      },
    });
    const audience = await prisma.audience.create({
      data: {
        organizationId: organization.id,
        name: "Mobile visitors",
        rules: { create: [{ organizationId: organization.id, field: "device", operator: "EQUALS", value: "mobile", groupIndex: 0 }] },
      },
    });
    const variant = await prisma.elementVariant.create({
      data: { organizationId: organization.id, contentElementId: element.id, content: "Personalized headline", method: "MANUAL" },
    });
    await prisma.elementPersonalizationRule.create({
      data: {
        organizationId: organization.id,
        contentElementId: element.id,
        audienceId: audience.id,
        elementVariantId: variant.id,
        priority: 0,
        status: "APPROVED",
      },
    });

    await recordSiteEvent(
      site.id,
      "https://example.com",
      { device: "mobile" },
      undefined,
      undefined,
      "visitor-1",
      undefined,
      TRACKED,
    );
    const visitor = await prisma.siteVisitor.findFirstOrThrow({ where: { siteId: site.id } });
    const sessionAfterView = await prisma.visitorSession.findFirstOrThrow({ where: { visitorId: visitor.id } });
    const impressionsAfterView = await prisma.impression.findMany({ where: { sessionId: sessionAfterView.id } });
    expect(impressionsAfterView).toHaveLength(1);

    await recordSiteEvent(
      site.id,
      "https://example.com",
      { device: "mobile" },
      undefined,
      { type: "CTA_CLICK", contentElementId: element.id },
      "visitor-1",
      undefined,
      TRACKED,
    );
    const impressionsAfterClick = await prisma.impression.findMany({ where: { sessionId: sessionAfterView.id } });
    expect(impressionsAfterClick).toHaveLength(1); // still 1, not 2
  });
});
