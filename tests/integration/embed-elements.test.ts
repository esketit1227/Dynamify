import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { getEmbedElements, recordSiteEvent, type ConsentState } from "@/lib/embed/service";
import { resetDb } from "../setup/reset";
import { createOrgWithUser } from "../setup/factories";

afterEach(async () => {
  await resetDb();
});

// docs/visitor-data.md's Consent architecture: IP-enrichment/visitor-
// history attributes now require personalization consent in addition to
// their own site-level toggle — tests in this file that are actually
// about those attribute-driven decisions simulate a consenting visitor.
const PERSONALIZATION_CONSENT: ConsentState = { necessary: true, analytics: true, personalization: true };

async function seedSite(
  organizationId: string,
  status: "READY" | "CRAWLING" = "READY",
  ipEnrichmentEnabled = false,
  visitorTrackingEnabled = false,
  holdbackPercent = 0,
) {
  const site = await prisma.site.create({
    data: { organizationId, url: "https://example.com", status, ipEnrichmentEnabled, visitorTrackingEnabled, holdbackPercent },
  });
  const page = await prisma.crawledPage.create({
    // Stored the way the crawler's normalizeUrl produces it — trailing slash.
    data: { siteId: site.id, organizationId, url: "https://example.com/" },
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

// This is a public, unauthenticated read (see src/lib/embed/service.ts) —
// the "security boundary" isn't a session, it's that a siteId only ever
// reveals that one site's own already-public content, nothing else.
describe("getEmbedElements", () => {
  it("returns the element inventory for a READY site's crawled page", async () => {
    const { organization } = await createOrgWithUser();
    const { site } = await seedSite(organization.id);

    const { elements } = await getEmbedElements(site.id, "https://example.com");
    expect(elements).toHaveLength(1);
    expect(elements[0]).toMatchObject({ selector: "h1", currentContent: "Real headline" });
  });

  it("normalizes a trailing-slash URL the same way the crawler does", async () => {
    const { organization } = await createOrgWithUser();
    const { site } = await seedSite(organization.id);

    // Stored with a trailing slash; queried without one — must still match.
    const { elements } = await getEmbedElements(site.id, "https://example.com");
    expect(elements).toHaveLength(1);
  });

  it("returns nothing for a site that isn't READY yet", async () => {
    const { organization } = await createOrgWithUser();
    const { site } = await seedSite(organization.id, "CRAWLING");

    const { elements } = await getEmbedElements(site.id, "https://example.com");
    expect(elements).toEqual([]);
  });

  it("returns nothing for a URL that was never crawled", async () => {
    const { organization } = await createOrgWithUser();
    const { site } = await seedSite(organization.id);

    const { elements } = await getEmbedElements(site.id, "https://example.com/never-crawled");
    expect(elements).toEqual([]);
  });

  // Phase 5 (docs/roadmap.md): a real visitor's URL almost always carries
  // UTM tags on campaign traffic, but the crawler never saw or stored
  // them — without stripping, every UTM-tagged visit would silently fail
  // to match its own crawled page, breaking both personalization and
  // event collection for exactly the traffic recommendations targets.
  it("matches its crawled page even when the visitor's URL carries UTM tags", async () => {
    const { organization } = await createOrgWithUser();
    const { site } = await seedSite(organization.id);

    const { elements } = await getEmbedElements(
      site.id,
      "https://example.com?utm_source=linkedin&utm_medium=social",
    );
    expect(elements).toHaveLength(1);
  });

  it("still treats a non-tracking query string as a distinct, uncrawled page", async () => {
    const { organization } = await createOrgWithUser();
    const { site } = await seedSite(organization.id);

    const { elements } = await getEmbedElements(site.id, "https://example.com?page=2");
    expect(elements).toEqual([]);
  });

  it("returns nothing for a malformed URL rather than throwing", async () => {
    const { organization } = await createOrgWithUser();
    const { site } = await seedSite(organization.id);

    const { elements } = await getEmbedElements(site.id, "not a url");
    expect(elements).toEqual([]);
  });

  it("never returns another site's elements, even if URLs happen to match", async () => {
    const { organization: orgA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();
    const { site: siteA } = await seedSite(orgA.id);
    await seedSite(orgB.id); // same URL, different site

    const { elements } = await getEmbedElements(siteA.id, "https://example.com");
    expect(elements).toHaveLength(1);
    // Confirm it's really scoped by siteId, not just by URL coincidence —
    // an unknown/wrong siteId with a URL that DOES exist elsewhere still
    // returns nothing.
    const { elements: nothing } = await getEmbedElements("not-a-real-site-id", "https://example.com");
    expect(nothing).toEqual([]);
  });

  // Phase 3: the runtime swap. resolve() is the exact same pure function
  // Live View and the dashboard preview already use — this just adds a
  // new caller of it.
  describe("with a visitor context", () => {
    async function seedApprovedRule(organizationId: string, pageId: string, elementId: string) {
      const audience = await prisma.audience.create({
        data: {
          organizationId,
          name: "Mobile visitors",
          rules: { create: [{ organizationId, field: "device", operator: "EQUALS", value: "mobile", groupIndex: 0 }] },
        },
      });
      const variant = await prisma.elementVariant.create({
        data: { organizationId, contentElementId: elementId, content: "Personalized headline", method: "MANUAL" },
      });
      await prisma.elementPersonalizationRule.create({
        data: {
          organizationId,
          contentElementId: elementId,
          audienceId: audience.id,
          elementVariantId: variant.id,
          priority: 0,
          status: "APPROVED",
        },
      });
    }

    it("attaches personalizedContent when the context matches an approved rule", async () => {
      const { organization } = await createOrgWithUser();
      const { site, page } = await seedSite(organization.id);
      const element = await prisma.contentElement.findFirstOrThrow({ where: { crawledPageId: page.id } });
      await seedApprovedRule(organization.id, page.id, element.id);

      const { elements } = await getEmbedElements(site.id, "https://example.com", { device: "mobile" });
      expect(elements[0].personalizedContent).toBe("Personalized headline");
    });

    it("omits personalizedContent when the context doesn't match any rule", async () => {
      const { organization } = await createOrgWithUser();
      const { site, page } = await seedSite(organization.id);
      const element = await prisma.contentElement.findFirstOrThrow({ where: { crawledPageId: page.id } });
      await seedApprovedRule(organization.id, page.id, element.id);

      const { elements } = await getEmbedElements(site.id, "https://example.com", { device: "desktop" });
      expect(elements[0].personalizedContent).toBeUndefined();
    });

    it("never resolves a PENDING rule, even with a matching context", async () => {
      const { organization } = await createOrgWithUser();
      const { site, page } = await seedSite(organization.id);
      const element = await prisma.contentElement.findFirstOrThrow({ where: { crawledPageId: page.id } });

      const audience = await prisma.audience.create({
        data: {
          organizationId: organization.id,
          name: "Mobile visitors",
          rules: {
            create: [{ organizationId: organization.id, field: "device", operator: "EQUALS", value: "mobile", groupIndex: 0 }],
          },
        },
      });
      const variant = await prisma.elementVariant.create({
        data: { organizationId: organization.id, contentElementId: element.id, content: "Not yet approved", method: "MANUAL" },
      });
      await prisma.elementPersonalizationRule.create({
        data: {
          organizationId: organization.id,
          contentElementId: element.id,
          audienceId: audience.id,
          elementVariantId: variant.id,
          priority: 0,
          // status defaults to PENDING
        },
      });

      const { elements } = await getEmbedElements(site.id, "https://example.com", { device: "mobile" });
      expect(elements[0].personalizedContent).toBeUndefined();
    });
  });
});

// Phase 6 (docs/roadmap.md): the raw material for generic-vs-personalized
// conversion reporting (D7, docs/decisions.md) — each event's
// `personalized` flag is computed and stored once here, at record time.
describe("recordSiteEvent", () => {
  async function seedApprovedRule(organizationId: string, elementId: string) {
    const audience = await prisma.audience.create({
      data: {
        organizationId,
        name: "Mobile visitors",
        rules: { create: [{ organizationId, field: "device", operator: "EQUALS", value: "mobile", groupIndex: 0 }] },
      },
    });
    const variant = await prisma.elementVariant.create({
      data: { organizationId, contentElementId: elementId, content: "Personalized CTA", method: "MANUAL" },
    });
    await prisma.elementPersonalizationRule.create({
      data: {
        organizationId,
        contentElementId: elementId,
        audienceId: audience.id,
        elementVariantId: variant.id,
        priority: 0,
        status: "APPROVED",
      },
    });
  }

  it("records a PAGE_VIEW with personalized: false when nothing on the page matched", async () => {
    const { organization } = await createOrgWithUser();
    const { site } = await seedSite(organization.id);

    await recordSiteEvent(site.id, "https://example.com", { device: "desktop" });

    const event = await prisma.siteEvent.findFirstOrThrow({ where: { siteId: site.id } });
    expect(event).toMatchObject({ type: "PAGE_VIEW", personalized: false, contentElementId: null });
  });

  it("records a PAGE_VIEW with personalized: true when the visitor matched an approved rule", async () => {
    const { organization } = await createOrgWithUser();
    const { site, page } = await seedSite(organization.id);
    const element = await prisma.contentElement.findFirstOrThrow({ where: { crawledPageId: page.id } });
    await seedApprovedRule(organization.id, element.id);

    await recordSiteEvent(site.id, "https://example.com", { device: "mobile" });

    const event = await prisma.siteEvent.findFirstOrThrow({ where: { siteId: site.id } });
    expect(event.personalized).toBe(true);
  });

  it("records a CTA_CLICK with personalized: true when the clicked element itself was personalized", async () => {
    const { organization } = await createOrgWithUser();
    const { site, page } = await seedSite(organization.id);
    const element = await prisma.contentElement.findFirstOrThrow({ where: { crawledPageId: page.id } });
    await seedApprovedRule(organization.id, element.id);

    await recordSiteEvent(
      site.id,
      "https://example.com",
      { device: "mobile" },
      undefined,
      { type: "CTA_CLICK", contentElementId: element.id },
    );

    const event = await prisma.siteEvent.findFirstOrThrow({ where: { siteId: site.id, type: "CTA_CLICK" } });
    expect(event).toMatchObject({ personalized: true, contentElementId: element.id });
  });

  it("records a CTA_CLICK with personalized: false when the visitor didn't match the clicked element's rule", async () => {
    const { organization } = await createOrgWithUser();
    const { site, page } = await seedSite(organization.id);
    const element = await prisma.contentElement.findFirstOrThrow({ where: { crawledPageId: page.id } });
    await seedApprovedRule(organization.id, element.id);

    await recordSiteEvent(
      site.id,
      "https://example.com",
      { device: "desktop" },
      undefined,
      { type: "CTA_CLICK", contentElementId: element.id },
    );

    const event = await prisma.siteEvent.findFirstOrThrow({ where: { siteId: site.id, type: "CTA_CLICK" } });
    expect(event.personalized).toBe(false);
  });

  // The one place this public, unauthenticated endpoint accepts a
  // client-supplied id — must not let one tenant's visitor traffic
  // pollute another tenant's analytics just because a script reports an
  // arbitrary contentElementId.
  it("drops a CTA_CLICK entirely when the contentElementId belongs to another org's site", async () => {
    const { organization: orgA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();
    const { site: siteA } = await seedSite(orgA.id);
    const { page: pageB } = await seedSite(orgB.id);
    const elementB = await prisma.contentElement.findFirstOrThrow({ where: { crawledPageId: pageB.id } });

    await recordSiteEvent(
      siteA.id,
      "https://example.com",
      { device: "desktop" },
      undefined,
      { type: "CTA_CLICK", contentElementId: elementB.id },
    );

    const events = await prisma.siteEvent.findMany({ where: { siteId: siteA.id } });
    expect(events).toEqual([]);
  });

  it("drops a CTA_CLICK entirely when the contentElementId doesn't exist at all", async () => {
    const { organization } = await createOrgWithUser();
    const { site } = await seedSite(organization.id);

    await recordSiteEvent(
      site.id,
      "https://example.com",
      { device: "desktop" },
      undefined,
      { type: "CTA_CLICK", contentElementId: "not-a-real-id" },
    );

    const events = await prisma.siteEvent.findMany({ where: { siteId: site.id } });
    expect(events).toEqual([]);
  });

  it("does nothing for a site that was never crawled at this URL, same as getEmbedElements", async () => {
    const { organization } = await createOrgWithUser();
    const { site } = await seedSite(organization.id);

    await recordSiteEvent(site.id, "https://example.com/never-crawled", { device: "desktop" });

    const events = await prisma.siteEvent.findMany({ where: { siteId: site.id } });
    expect(events).toEqual([]);
  });
});

// Behavioral targeting (docs/roadmap.md Hardening): a visitor's own real,
// accumulated intent/stage (src/lib/visitors/inferProfile.ts) now feeds
// personalization decisions themselves, not just the Visitors dashboard —
// via attributes.stage / attributes.intentScore, through the exact same
// audience-rule engine every other attribute already goes through (zero
// engine changes; packages/sdk/src/audience.ts already resolves dotted
// "attributes.*" paths).
describe("behavioral targeting (attributes.stage / attributes.intentScore)", () => {
  async function seedTrackedVisitor(
    organizationId: string,
    siteId: string,
    visitorKey: string,
    stage: string,
    intentScore: number,
  ) {
    await prisma.siteVisitor.create({
      data: { organizationId, siteId, visitorKey, stage, intentScore },
    });
  }

  async function seedApprovedRule(
    organizationId: string,
    elementId: string,
    field: string,
    operator: "EQUALS" | "GREATER_THAN",
    value: unknown,
    content: string,
  ) {
    const audience = await prisma.audience.create({
      data: {
        organizationId,
        name: `Rule on ${field}`,
        rules: { create: [{ organizationId, field, operator, value: value as never, groupIndex: 0 }] },
      },
    });
    const variant = await prisma.elementVariant.create({
      data: { organizationId, contentElementId: elementId, content, method: "MANUAL" },
    });
    await prisma.elementPersonalizationRule.create({
      data: {
        organizationId,
        contentElementId: elementId,
        audienceId: audience.id,
        elementVariantId: variant.id,
        priority: 0,
        status: "APPROVED",
      },
    });
  }

  it("matches a rule on attributes.stage for a real tracked visitor", async () => {
    const { organization } = await createOrgWithUser();
    const { site, page } = await seedSite(organization.id, "READY", false, true);
    const element = await prisma.contentElement.findFirstOrThrow({ where: { crawledPageId: page.id } });
    await seedTrackedVisitor(organization.id, site.id, "visitor-1", "evaluation", 0.8);
    await seedApprovedRule(organization.id, element.id, "attributes.stage", "EQUALS", "evaluation", "High-intent headline");

    const { elements } = await getEmbedElements(
      site.id,
      "https://example.com",
      { device: "desktop" },
      undefined,
      "visitor-1",
      undefined,
      PERSONALIZATION_CONSENT,
    );
    expect(elements[0].personalizedContent).toBe("High-intent headline");
  });

  it("matches a rule on attributes.intentScore with GREATER_THAN", async () => {
    const { organization } = await createOrgWithUser();
    const { site, page } = await seedSite(organization.id, "READY", false, true);
    const element = await prisma.contentElement.findFirstOrThrow({ where: { crawledPageId: page.id } });
    await seedTrackedVisitor(organization.id, site.id, "visitor-1", "evaluation", 0.9);
    await seedApprovedRule(organization.id, element.id, "attributes.intentScore", "GREATER_THAN", 0.5, "High score headline");

    const { elements } = await getEmbedElements(
      site.id,
      "https://example.com",
      { device: "desktop" },
      undefined,
      "visitor-1",
      undefined,
      PERSONALIZATION_CONSENT,
    );
    expect(elements[0].personalizedContent).toBe("High score headline");
  });

  it("does not match when the visitor's real stage doesn't satisfy the rule", async () => {
    const { organization } = await createOrgWithUser();
    const { site, page } = await seedSite(organization.id, "READY", false, true);
    const element = await prisma.contentElement.findFirstOrThrow({ where: { crawledPageId: page.id } });
    await seedTrackedVisitor(organization.id, site.id, "visitor-1", "awareness", 0.05);
    await seedApprovedRule(organization.id, element.id, "attributes.stage", "EQUALS", "evaluation", "High-intent headline");

    const { elements } = await getEmbedElements(
      site.id,
      "https://example.com",
      { device: "desktop" },
      undefined,
      "visitor-1",
      undefined,
      PERSONALIZATION_CONSENT,
    );
    expect(elements[0].personalizedContent).toBeUndefined();
  });

  it("never applies behavioral targeting when the site has tracking off, even with a matching visitorKey", async () => {
    const { organization } = await createOrgWithUser();
    const { site, page } = await seedSite(organization.id, "READY", false, false);
    const element = await prisma.contentElement.findFirstOrThrow({ where: { crawledPageId: page.id } });
    // A SiteVisitor row could only exist here from before tracking was
    // turned off, but the point holds regardless of how it got there.
    await seedTrackedVisitor(organization.id, site.id, "visitor-1", "evaluation", 0.9);
    await seedApprovedRule(organization.id, element.id, "attributes.stage", "EQUALS", "evaluation", "High-intent headline");

    const { elements } = await getEmbedElements(
      site.id,
      "https://example.com",
      { device: "desktop" },
      undefined,
      "visitor-1",
      undefined,
      PERSONALIZATION_CONSENT,
    );
    expect(elements[0].personalizedContent).toBeUndefined();
  });

  it("never applies behavioral targeting when the visitor withheld personalization consent, even with tracking on", async () => {
    const { organization } = await createOrgWithUser();
    const { site, page } = await seedSite(organization.id, "READY", false, true);
    const element = await prisma.contentElement.findFirstOrThrow({ where: { crawledPageId: page.id } });
    await seedTrackedVisitor(organization.id, site.id, "visitor-1", "evaluation", 0.9);
    await seedApprovedRule(organization.id, element.id, "attributes.stage", "EQUALS", "evaluation", "High-intent headline");

    // Default consent — personalization was never granted.
    const { elements } = await getEmbedElements(site.id, "https://example.com", { device: "desktop" }, undefined, "visitor-1");
    expect(elements[0].personalizedContent).toBeUndefined();
  });

  it("degrades gracefully for a brand-new or unrecognized visitorKey", async () => {
    const { organization } = await createOrgWithUser();
    const { site, page } = await seedSite(organization.id, "READY", false, true);
    const element = await prisma.contentElement.findFirstOrThrow({ where: { crawledPageId: page.id } });
    await seedApprovedRule(organization.id, element.id, "attributes.stage", "EQUALS", "evaluation", "High-intent headline");

    const { elements } = await getEmbedElements(
      site.id,
      "https://example.com",
      { device: "desktop" },
      undefined,
      "never-seen-before",
      undefined,
      PERSONALIZATION_CONSENT,
    );
    expect(elements[0].personalizedContent).toBeUndefined();
  });

  it("marks the response non-cacheable whenever a visitor lookup was attempted", async () => {
    const { organization } = await createOrgWithUser();
    const { site } = await seedSite(organization.id, "READY", false, true);
    await seedTrackedVisitor(organization.id, site.id, "visitor-1", "evaluation", 0.9);

    const withVisitor = await getEmbedElements(
      site.id,
      "https://example.com",
      { device: "desktop" },
      undefined,
      "visitor-1",
      undefined,
      PERSONALIZATION_CONSENT,
    );
    expect(withVisitor.cacheable).toBe(false);

    const withoutVisitorKey = await getEmbedElements(site.id, "https://example.com", { device: "desktop" });
    expect(withoutVisitorKey.cacheable).toBe(true);
  });

  it("keeps recordSiteEvent's personalized flag consistent with what getEmbedElements actually decided", async () => {
    const { organization } = await createOrgWithUser();
    const { site, page } = await seedSite(organization.id, "READY", false, true);
    const element = await prisma.contentElement.findFirstOrThrow({ where: { crawledPageId: page.id } });
    await seedTrackedVisitor(organization.id, site.id, "visitor-1", "evaluation", 0.9);
    await seedApprovedRule(organization.id, element.id, "attributes.stage", "EQUALS", "evaluation", "High-intent headline");

    const { elements } = await getEmbedElements(
      site.id,
      "https://example.com",
      { device: "desktop" },
      undefined,
      "visitor-1",
      undefined,
      PERSONALIZATION_CONSENT,
    );
    expect(elements[0].personalizedContent).toBe("High-intent headline");

    await recordSiteEvent(
      site.id,
      "https://example.com",
      { device: "desktop" },
      undefined,
      undefined,
      "visitor-1",
      undefined,
      PERSONALIZATION_CONSENT,
    );
    const event = await prisma.siteEvent.findFirstOrThrow({ where: { siteId: site.id } });
    expect(event.personalized).toBe(true);
  });
});

// Phase 6 (docs/roadmap.md): IP-based firmographic enrichment. The
// "configured, real provider" round-trip is proven live instead (no
// IPINFO_API_KEY exists in this test env, and env.ts parses it once at
// module load — see docs/roadmap.md's Phase 6 verification note). What's
// meaningfully testable here without a provider: the disabled path stays
// a true no-op, the caching-correctness fix works even when enrichment
// finds nothing (a stale key or an outage must never make a public
// response quietly cacheable again), and — the real security fix this
// phase found — a client can never spoof its own `attributes`.
// A/B holdout (docs/roadmap.md Hardening): the actual fix for the
// confounded generic-vs-personalized comparison — a configurable % of
// visitors who'd otherwise be personalized see the default anyway, so
// lift can be measured against a true control group. holdbackPercent 100
// is used throughout so the coin flip is deterministic regardless of
// which seed lands where — see tests/unit/experiments/holdout.test.ts
// for the distribution itself.
describe("A/B holdout", () => {
  async function seedApprovedRule(organizationId: string, elementId: string) {
    const audience = await prisma.audience.create({
      data: {
        organizationId,
        name: "Desktop visitors",
        rules: { create: [{ organizationId, field: "device", operator: "EQUALS", value: "desktop", groupIndex: 0 }] },
      },
    });
    const variant = await prisma.elementVariant.create({
      data: { organizationId, contentElementId: elementId, content: "Personalized headline", method: "MANUAL" },
    });
    await prisma.elementPersonalizationRule.create({
      data: {
        organizationId,
        contentElementId: elementId,
        audienceId: audience.id,
        elementVariantId: variant.id,
        priority: 0,
        status: "APPROVED",
      },
    });
  }

  it("shows the default instead of the personalized variant when a matching visit is held out", async () => {
    const { organization } = await createOrgWithUser();
    const { site, page } = await seedSite(organization.id, "READY", false, false, 100);
    const element = await prisma.contentElement.findFirstOrThrow({ where: { crawledPageId: page.id } });
    await seedApprovedRule(organization.id, element.id);

    const { elements } = await getEmbedElements(
      site.id,
      "https://example.com",
      { device: "desktop" },
      undefined,
      "visitor-1",
    );
    expect(elements[0].personalizedContent).toBeUndefined();
  });

  it("records the held-out visit as personalized: false, heldOut: true", async () => {
    const { organization } = await createOrgWithUser();
    const { site, page } = await seedSite(organization.id, "READY", false, false, 100);
    const element = await prisma.contentElement.findFirstOrThrow({ where: { crawledPageId: page.id } });
    await seedApprovedRule(organization.id, element.id);

    await recordSiteEvent(site.id, "https://example.com", { device: "desktop" }, undefined, undefined, "visitor-1");

    const event = await prisma.siteEvent.findFirstOrThrow({ where: { siteId: site.id } });
    expect(event).toMatchObject({ personalized: false, heldOut: true });
  });

  it("keeps applying personalization normally when holdbackPercent is 0 (the default)", async () => {
    const { organization } = await createOrgWithUser();
    const { site, page } = await seedSite(organization.id, "READY", false, false, 0);
    const element = await prisma.contentElement.findFirstOrThrow({ where: { crawledPageId: page.id } });
    await seedApprovedRule(organization.id, element.id);

    const { elements } = await getEmbedElements(
      site.id,
      "https://example.com",
      { device: "desktop" },
      undefined,
      "visitor-1",
    );
    expect(elements[0].personalizedContent).toBe("Personalized headline");

    await recordSiteEvent(site.id, "https://example.com", { device: "desktop" }, undefined, undefined, "visitor-1");
    const event = await prisma.siteEvent.findFirstOrThrow({ where: { siteId: site.id } });
    expect(event).toMatchObject({ personalized: true, heldOut: false });
  });

  it("holds out anonymous traffic too, using loadToken as the seed", async () => {
    const { organization } = await createOrgWithUser();
    const { site, page } = await seedSite(organization.id, "READY", false, false, 100);
    const element = await prisma.contentElement.findFirstOrThrow({ where: { crawledPageId: page.id } });
    await seedApprovedRule(organization.id, element.id);

    const { elements } = await getEmbedElements(
      site.id,
      "https://example.com",
      { device: "desktop" },
      undefined,
      undefined,
      "load-token-abc",
    );
    expect(elements[0].personalizedContent).toBeUndefined();
  });

  it("never applies holdout when there's no seed at all (no visitorKey, no loadToken)", async () => {
    const { organization } = await createOrgWithUser();
    const { site, page } = await seedSite(organization.id, "READY", false, false, 100);
    const element = await prisma.contentElement.findFirstOrThrow({ where: { crawledPageId: page.id } });
    await seedApprovedRule(organization.id, element.id);

    const { elements } = await getEmbedElements(site.id, "https://example.com", { device: "desktop" });
    expect(elements[0].personalizedContent).toBe("Personalized headline");
  });

  it("never holds out a visit that never matched anything in the first place", async () => {
    const { organization } = await createOrgWithUser();
    const { site, page } = await seedSite(organization.id, "READY", false, false, 100);
    const element = await prisma.contentElement.findFirstOrThrow({ where: { crawledPageId: page.id } });
    await seedApprovedRule(organization.id, element.id);

    // Mobile never matches the desktop-only rule above.
    await recordSiteEvent(site.id, "https://example.com", { device: "mobile" }, undefined, undefined, "visitor-1");
    const event = await prisma.siteEvent.findFirstOrThrow({ where: { siteId: site.id } });
    expect(event).toMatchObject({ personalized: false, heldOut: false });
  });

  it("marks the elements response non-cacheable whenever the site is running a holdout experiment", async () => {
    const { organization } = await createOrgWithUser();
    const { site: holdoutSite } = await seedSite(organization.id, "READY", false, false, 10);
    const withHoldout = await getEmbedElements(holdoutSite.id, "https://example.com", { device: "desktop" });
    expect(withHoldout.cacheable).toBe(false);

    const { site: normalSite } = await seedSite(organization.id, "READY", false, false, 0);
    const withoutHoldout = await getEmbedElements(normalSite.id, "https://example.com", { device: "desktop" });
    expect(withoutHoldout.cacheable).toBe(true);
  });

  it("getEmbedElements and recordSiteEvent agree on the same held-out visit", async () => {
    const { organization } = await createOrgWithUser();
    const { site, page } = await seedSite(organization.id, "READY", false, false, 100);
    const element = await prisma.contentElement.findFirstOrThrow({ where: { crawledPageId: page.id } });
    await seedApprovedRule(organization.id, element.id);

    const { elements } = await getEmbedElements(
      site.id,
      "https://example.com",
      { device: "desktop" },
      undefined,
      "visitor-1",
    );
    expect(elements[0].personalizedContent).toBeUndefined();

    await recordSiteEvent(site.id, "https://example.com", { device: "desktop" }, undefined, undefined, "visitor-1");
    const event = await prisma.siteEvent.findFirstOrThrow({ where: { siteId: site.id } });
    // What the visitor actually saw (default) matches what got recorded
    // (heldOut: true, personalized: false) — the whole point.
    expect(event.heldOut).toBe(true);
    expect(event.personalized).toBe(false);
  });
});

describe("IP-based enrichment (Phase 6)", () => {
  const PUBLIC_IP = "8.8.8.8";

  it("never populates attributes when the site hasn't opted in, even with a real public IP", async () => {
    const { organization } = await createOrgWithUser();
    const { site } = await seedSite(organization.id, "READY", false);

    await recordSiteEvent(site.id, "https://example.com", { device: "desktop" }, PUBLIC_IP);

    const event = await prisma.siteEvent.findFirstOrThrow({ where: { siteId: site.id } });
    expect((event.context as { attributes?: unknown }).attributes).toBeUndefined();
  });

  it("marks the elements response non-cacheable whenever enrichment is attempted, even if it finds nothing", async () => {
    const { organization } = await createOrgWithUser();
    const { site } = await seedSite(organization.id, "READY", true);

    const enabled = await getEmbedElements(
      site.id,
      "https://example.com",
      { device: "desktop" },
      PUBLIC_IP,
      undefined,
      undefined,
      PERSONALIZATION_CONSENT,
    );
    expect(enabled.cacheable).toBe(false);

    const { site: disabledSite } = await seedSite(organization.id, "READY", false);
    const disabled = await getEmbedElements(
      disabledSite.id,
      "https://example.com",
      { device: "desktop" },
      PUBLIC_IP,
      undefined,
      undefined,
      PERSONALIZATION_CONSENT,
    );
    expect(disabled.cacheable).toBe(true);
  });

  it("stays cacheable when no visitor IP is available at all, even on an opted-in site", async () => {
    const { organization } = await createOrgWithUser();
    const { site } = await seedSite(organization.id, "READY", true);

    const result = await getEmbedElements(site.id, "https://example.com", { device: "desktop" });
    expect(result.cacheable).toBe(true);
  });

  it("stays cacheable when the visitor withholds personalization consent, even with enrichment on and a real IP", async () => {
    const { organization } = await createOrgWithUser();
    const { site } = await seedSite(organization.id, "READY", true);

    // Default consent — personalization was never granted, so enrichment
    // is never attempted at all.
    const result = await getEmbedElements(site.id, "https://example.com", { device: "desktop" }, PUBLIC_IP);
    expect(result.cacheable).toBe(true);
  });

  // The real gap found while building this: visitorContextSchema (shared
  // with trusted internal callers) also validates the public events
  // route's body, so a raw request could already set its own
  // attributes.* and have them matched against audience rules.
  it("never lets a client-supplied attribute reach matching or storage, opted in or not", async () => {
    const { organization } = await createOrgWithUser();
    const { site, page } = await seedSite(organization.id, "READY", false);
    const element = await prisma.contentElement.findFirstOrThrow({ where: { crawledPageId: page.id } });

    const audience = await prisma.audience.create({
      data: {
        organizationId: organization.id,
        name: "Self-declared enterprise",
        rules: {
          create: [
            { organizationId: organization.id, field: "attributes.buyingIntent", operator: "EQUALS", value: "high", groupIndex: 0 },
          ],
        },
      },
    });
    const variant = await prisma.elementVariant.create({
      data: { organizationId: organization.id, contentElementId: element.id, content: "Enterprise headline", method: "MANUAL" },
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

    // A crafted context claiming a high-value attribute a real visitor
    // never actually has any way to set for themselves.
    const spoofedContext = { device: "desktop" as const, attributes: { buyingIntent: "high" } };

    const { elements } = await getEmbedElements(site.id, "https://example.com", spoofedContext);
    expect(elements[0].personalizedContent).toBeUndefined();

    await recordSiteEvent(site.id, "https://example.com", spoofedContext);
    const event = await prisma.siteEvent.findFirstOrThrow({ where: { siteId: site.id } });
    expect(event.personalized).toBe(false);
    expect((event.context as { attributes?: unknown }).attributes).toBeUndefined();
  });
});
