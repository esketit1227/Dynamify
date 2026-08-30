import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { recordSiteEvent, type ConsentState } from "@/lib/embed/service";
import { listSiteVisitors } from "@/lib/visitors/service";
import { resetDb } from "../setup/reset";
import { createOrgWithUser } from "../setup/factories";

afterEach(async () => {
  await resetDb();
});

// docs/visitor-data.md's Consent architecture: persistent visitor
// tracking (SiteVisitor/VisitorSession) requires *both* the site-level
// opt-in and this visitor-level consent — a real, separate gate from the
// site toggle. Most tests below are about tracking mechanics, so they
// simulate a visitor who has actually consented.
const TRACKED: ConsentState = { necessary: true, analytics: true, personalization: true };

async function seedSite(organizationId: string, visitorTrackingEnabled: boolean) {
  const site = await prisma.site.create({
    data: { organizationId, url: "https://example.com", status: "READY", visitorTrackingEnabled },
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
  return { site, page };
}

// D5/D7 (docs/decisions.md): real, re-identifiable visitor tracking is
// deliberately off unless a site opts in *and* the visitor consents —
// these tests are the real security/data-boundary this posture depends
// on, not just a happy path.
describe("recordSiteEvent — SiteVisitor (opt-in visitor tracking)", () => {
  it("does nothing when the site hasn't opted in, even with a visitorKey and consent sent", async () => {
    const { organization } = await createOrgWithUser();
    const { site } = await seedSite(organization.id, false);

    await recordSiteEvent(
      site.id,
      "https://example.com",
      { device: "desktop" },
      undefined,
      undefined,
      "visitor-1",
      undefined,
      TRACKED,
    );

    const visitors = await prisma.siteVisitor.findMany({ where: { siteId: site.id } });
    expect(visitors).toEqual([]);
    // The anonymous SiteEvent is still recorded — analytics consent
    // gates the *persistent* visitor record, not the base anonymous
    // event (docs/visitor-data.md's "Always, no consent needed" bucket).
    const event = await prisma.siteEvent.findFirstOrThrow({ where: { siteId: site.id } });
    expect(event.visitorId).toBeNull();
  });

  it("does nothing when the site opted in but no visitorKey was sent", async () => {
    const { organization } = await createOrgWithUser();
    const { site } = await seedSite(organization.id, true);

    await recordSiteEvent(site.id, "https://example.com", { device: "desktop" }, undefined, undefined, undefined, undefined, TRACKED);

    const visitors = await prisma.siteVisitor.findMany({ where: { siteId: site.id } });
    expect(visitors).toEqual([]);
  });

  it("does nothing when the site opted in and a visitorKey was sent, but the visitor withheld analytics consent", async () => {
    const { organization } = await createOrgWithUser();
    const { site } = await seedSite(organization.id, true);

    // Default consent (necessary-only) — the caller never opted the
    // visitor into analytics.
    await recordSiteEvent(site.id, "https://example.com", { device: "desktop" }, undefined, undefined, "visitor-1");

    const visitors = await prisma.siteVisitor.findMany({ where: { siteId: site.id } });
    expect(visitors).toEqual([]);
    // Still recorded anonymously.
    const event = await prisma.siteEvent.findFirstOrThrow({ where: { siteId: site.id } });
    expect(event.visitorId).toBeNull();
  });

  it("creates a SiteVisitor on the first event and links it to the event", async () => {
    const { organization } = await createOrgWithUser();
    const { site } = await seedSite(organization.id, true);

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
    expect(visitor).toMatchObject({
      visitorKey: "visitor-1",
      pageViewCount: 1,
      ctaClickCount: 0,
      distinctPages: 1,
      lastDevice: "mobile",
      interest: "Home",
      stage: "awareness",
    });

    const event = await prisma.siteEvent.findFirstOrThrow({ where: { siteId: site.id } });
    expect(event.visitorId).toBe(visitor.id);

    // docs/visitor-data.md: a real VisitorSession, not just running
    // totals on SiteVisitor.
    const session = await prisma.visitorSession.findFirstOrThrow({ where: { visitorId: visitor.id } });
    expect(session.pageViewCount).toBe(1);
  });

  it("updates the same SiteVisitor (not a duplicate) on a second event from the same visitor", async () => {
    const { organization } = await createOrgWithUser();
    const { site } = await seedSite(organization.id, true);

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

    const visitors = await prisma.siteVisitor.findMany({ where: { siteId: site.id } });
    expect(visitors).toHaveLength(1);
    expect(visitors[0].pageViewCount).toBe(2);
    // Same page visited twice — distinctPages must not double-count.
    expect(visitors[0].distinctPages).toBe(1);

    // Same session (within the gap window), not a second one.
    const sessions = await prisma.visitorSession.findMany({ where: { visitorId: visitors[0].id } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].pageViewCount).toBe(2);
  });

  it("treats a CTA_CLICK as a conversion signal and raises intent", async () => {
    const { organization } = await createOrgWithUser();
    const { site, page } = await seedSite(organization.id, true);
    const element = await prisma.contentElement.findFirstOrThrow({ where: { crawledPageId: page.id } });

    await recordSiteEvent(
      site.id,
      "https://example.com",
      { device: "desktop" },
      undefined,
      undefined,
      "visitor-1",
      undefined,
      TRACKED,
    );
    const beforeClick = await prisma.siteVisitor.findFirstOrThrow({ where: { siteId: site.id } });

    await recordSiteEvent(
      site.id,
      "https://example.com",
      { device: "desktop" },
      undefined,
      { type: "CTA_CLICK", contentElementId: element.id },
      "visitor-1",
      undefined,
      TRACKED,
    );

    const afterClick = await prisma.siteVisitor.findFirstOrThrow({ where: { siteId: site.id } });
    expect(afterClick.ctaClickCount).toBe(1);
    expect(afterClick.intentScore).toBeGreaterThan(beforeClick.intentScore);

    // A real, stored Conversion row (docs/visitor-data.md), not just the
    // derived ctaClickCount > 0 boolean.
    const session = await prisma.visitorSession.findFirstOrThrow({ where: { visitorId: afterClick.id } });
    const conversions = await prisma.conversion.findMany({ where: { sessionId: session.id } });
    expect(conversions).toHaveLength(1);
  });

  // Found via live verification, not hypothetical: two near-simultaneous
  // events for the same visitor (e.g. two tabs) must not lose an
  // increment. See upsertSiteVisitor's row-lock comment for the fix.
  it("never loses an increment when two events for the same visitor race", async () => {
    const { organization } = await createOrgWithUser();
    const { site } = await seedSite(organization.id, true);

    const CONCURRENT_EVENTS = 10;
    await Promise.all(
      Array.from({ length: CONCURRENT_EVENTS }, () =>
        recordSiteEvent(
          site.id,
          "https://example.com",
          { device: "desktop" },
          undefined,
          undefined,
          "visitor-1",
          undefined,
          TRACKED,
        ),
      ),
    );

    const visitors = await prisma.siteVisitor.findMany({ where: { siteId: site.id } });
    expect(visitors).toHaveLength(1);
    expect(visitors[0].pageViewCount).toBe(CONCURRENT_EVENTS);
  });

  // Caught via live verification, not by inspection: the first version
  // wrote consentState only via the schema default at row-creation time
  // and never actually updated it on subsequent writes, so a visitor's
  // real, granted consent never showed up anywhere — every visitor
  // looked like they'd withheld everything, regardless of what consent
  // was actually sent.
  it("persists the visitor's actual consent state, not just the schema default", async () => {
    const { organization } = await createOrgWithUser();
    const { site } = await seedSite(organization.id, true);

    await recordSiteEvent(
      site.id,
      "https://example.com",
      { device: "desktop" },
      undefined,
      undefined,
      "visitor-1",
      undefined,
      TRACKED,
    );

    const visitor = await prisma.siteVisitor.findFirstOrThrow({ where: { siteId: site.id } });
    expect(visitor.consentState).toEqual({ necessary: true, analytics: true, personalization: true });
  });

  it("keeps two visitors on the same site as separate rows", async () => {
    const { organization } = await createOrgWithUser();
    const { site } = await seedSite(organization.id, true);

    await recordSiteEvent(
      site.id,
      "https://example.com",
      { device: "desktop" },
      undefined,
      undefined,
      "visitor-1",
      undefined,
      TRACKED,
    );
    await recordSiteEvent(
      site.id,
      "https://example.com",
      { device: "desktop" },
      undefined,
      undefined,
      "visitor-2",
      undefined,
      TRACKED,
    );

    const visitors = await prisma.siteVisitor.findMany({ where: { siteId: site.id } });
    expect(visitors).toHaveLength(2);
  });
});

describe("listSiteVisitors", () => {
  it("never returns another organization's visitors", async () => {
    const { organization: orgA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();
    const { site: siteA } = await seedSite(orgA.id, true);
    const { site: siteB } = await seedSite(orgB.id, true);

    await recordSiteEvent(
      siteA.id,
      "https://example.com",
      { device: "desktop" },
      undefined,
      undefined,
      "visitor-a",
      undefined,
      TRACKED,
    );
    await recordSiteEvent(
      siteB.id,
      "https://example.com",
      { device: "desktop" },
      undefined,
      undefined,
      "visitor-b",
      undefined,
      TRACKED,
    );

    const visitorsForA = await listSiteVisitors(orgA.id);
    expect(visitorsForA).toHaveLength(1);
    expect(visitorsForA[0].visitorKey).toBe("visitor-a");
  });

  it("filters to a single site when a siteId is given", async () => {
    const { organization } = await createOrgWithUser();
    const { site: siteA } = await seedSite(organization.id, true);
    const { site: siteB } = await seedSite(organization.id, true);

    await recordSiteEvent(
      siteA.id,
      "https://example.com",
      { device: "desktop" },
      undefined,
      undefined,
      "visitor-a",
      undefined,
      TRACKED,
    );
    await recordSiteEvent(
      siteB.id,
      "https://example.com",
      { device: "desktop" },
      undefined,
      undefined,
      "visitor-b",
      undefined,
      TRACKED,
    );

    const visitorsForSiteA = await listSiteVisitors(organization.id, siteA.id);
    expect(visitorsForSiteA).toHaveLength(1);
    expect(visitorsForSiteA[0].visitorKey).toBe("visitor-a");
  });
});
