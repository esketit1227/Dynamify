import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { getOrgAnalytics } from "@/lib/analytics/service";
import { resetDb } from "../setup/reset";
import { createOrgWithUser } from "../setup/factories";

afterEach(async () => {
  await resetDb();
});

async function seedSiteWithPage(organizationId: string, url = "https://example.com", holdbackPercent = 0) {
  const site = await prisma.site.create({ data: { organizationId, url, status: "READY", holdbackPercent } });
  const page = await prisma.crawledPage.create({ data: { siteId: site.id, organizationId, url } });
  return { site, page };
}

async function seedEvent(
  organizationId: string,
  siteId: string,
  crawledPageId: string,
  type: "PAGE_VIEW" | "CTA_CLICK",
  personalized: boolean,
  count = 1,
  heldOut = false,
) {
  await prisma.siteEvent.createMany({
    data: Array(count).fill({
      organizationId,
      siteId,
      crawledPageId,
      type,
      personalized,
      heldOut,
      context: {},
    }),
  });
}

// docs/product-spec.md §20 / D7 (docs/decisions.md): generic-vs-personalized
// conversion reporting as an aggregate ratio over independently-flagged
// events, computed straight off the `personalized` column each SiteEvent
// row already carries — see tests/integration/embed-elements.test.ts's
// recordSiteEvent tests for where that column gets set.
describe("getOrgAnalytics", () => {
  it("reports no data for an org with no events", async () => {
    const { organization } = await createOrgWithUser();
    const analytics = await getOrgAnalytics(organization.id);
    expect(analytics.hasAnyData).toBe(false);
  });

  it("totals page views and CTA clicks, split by personalized vs. generic", async () => {
    const { organization } = await createOrgWithUser();
    const { site, page } = await seedSiteWithPage(organization.id);

    await seedEvent(organization.id, site.id, page.id, "PAGE_VIEW", false, 20);
    await seedEvent(organization.id, site.id, page.id, "PAGE_VIEW", true, 10);
    await seedEvent(organization.id, site.id, page.id, "CTA_CLICK", false, 2);
    await seedEvent(organization.id, site.id, page.id, "CTA_CLICK", true, 3);

    const analytics = await getOrgAnalytics(organization.id);
    expect(analytics.hasAnyData).toBe(true);
    expect(analytics.totals).toEqual({
      pageViews: 20,
      personalizedPageViews: 10,
      ctaClicks: 2,
      personalizedCtaClicks: 3,
    });
  });

  it("computes generic and personalized conversion rate as independent ratios", async () => {
    const { organization } = await createOrgWithUser();
    const { site, page } = await seedSiteWithPage(organization.id);

    await seedEvent(organization.id, site.id, page.id, "PAGE_VIEW", false, 20); // generic
    await seedEvent(organization.id, site.id, page.id, "PAGE_VIEW", true, 10); // personalized
    await seedEvent(organization.id, site.id, page.id, "CTA_CLICK", false, 2); // 2/20 = 10%
    await seedEvent(organization.id, site.id, page.id, "CTA_CLICK", true, 3); // 3/10 = 30%

    const analytics = await getOrgAnalytics(organization.id);
    expect(analytics.genericConversionRate).toBeCloseTo(0.1);
    expect(analytics.personalizedConversionRate).toBeCloseTo(0.3);
  });

  it("returns null (not 0) for a rate when its page-view denominator is 0", async () => {
    const { organization } = await createOrgWithUser();
    const { site, page } = await seedSiteWithPage(organization.id);

    // Only personalized traffic exists — no generic page views at all.
    await seedEvent(organization.id, site.id, page.id, "PAGE_VIEW", true, 5);
    await seedEvent(organization.id, site.id, page.id, "CTA_CLICK", true, 1);

    const analytics = await getOrgAnalytics(organization.id);
    expect(analytics.genericConversionRate).toBeNull();
    expect(analytics.personalizedConversionRate).toBeCloseTo(0.2);
  });

  it("breaks totals down per site, and lists a site with zero events as all-zero/null", async () => {
    const { organization } = await createOrgWithUser();
    const { site: siteA, page: pageA } = await seedSiteWithPage(organization.id, "https://a.example.com");
    const { site: siteB } = await seedSiteWithPage(organization.id, "https://b.example.com");

    await seedEvent(organization.id, siteA.id, pageA.id, "PAGE_VIEW", false, 10);
    await seedEvent(organization.id, siteA.id, pageA.id, "CTA_CLICK", false, 1);

    const analytics = await getOrgAnalytics(organization.id);
    expect(analytics.perSite).toHaveLength(2);

    const rowA = analytics.perSite.find((r) => r.siteId === siteA.id)!;
    expect(rowA).toMatchObject({ pageViews: 10, ctaClicks: 1 });
    expect(rowA.genericConversionRate).toBeCloseTo(0.1);

    const rowB = analytics.perSite.find((r) => r.siteId === siteB.id)!;
    expect(rowB).toMatchObject({
      pageViews: 0,
      personalizedPageViews: 0,
      ctaClicks: 0,
      personalizedCtaClicks: 0,
      genericConversionRate: null,
      personalizedConversionRate: null,
    });
  });

  it("never mixes another organization's events into totals", async () => {
    const { organization: orgA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();
    const { site: siteA, page: pageA } = await seedSiteWithPage(orgA.id);
    const { site: siteB, page: pageB } = await seedSiteWithPage(orgB.id);

    await seedEvent(orgA.id, siteA.id, pageA.id, "PAGE_VIEW", false, 5);
    await seedEvent(orgB.id, siteB.id, pageB.id, "PAGE_VIEW", false, 999);

    const analytics = await getOrgAnalytics(orgA.id);
    expect(analytics.totals.pageViews).toBe(5);
  });
});

// Causal lift (docs/roadmap.md Hardening): the holdout-based comparison —
// see src/lib/experiments/holdout.ts and src/lib/analytics/significance.ts
// for why this exists (the generic-vs-personalized numbers above compare
// different populations; this compares the same qualifying population,
// split by a coin flip).
describe("getOrgAnalytics — causal lift", () => {
  it("is null for a site that has never enabled holdback", async () => {
    const { organization } = await createOrgWithUser();
    const { site, page } = await seedSiteWithPage(organization.id, "https://example.com", 0);
    await seedEvent(organization.id, site.id, page.id, "PAGE_VIEW", true, 10);

    const analytics = await getOrgAnalytics(organization.id);
    const row = analytics.perSite.find((r) => r.siteId === site.id)!;
    expect(row.causalLift).toBeNull();
  });

  it("is null when holdback is enabled but no holdout events exist yet", async () => {
    const { organization } = await createOrgWithUser();
    const { site, page } = await seedSiteWithPage(organization.id, "https://example.com", 20);
    await seedEvent(organization.id, site.id, page.id, "PAGE_VIEW", true, 10);

    const analytics = await getOrgAnalytics(organization.id);
    const row = analytics.perSite.find((r) => r.siteId === site.id)!;
    expect(row.causalLift).toBeNull();
  });

  it("computes holdout vs. treatment conversion rates from the same qualifying population", async () => {
    const { organization } = await createOrgWithUser();
    const { site, page } = await seedSiteWithPage(organization.id, "https://example.com", 20);

    // Holdout group: matched a rule, held back to default.
    await seedEvent(organization.id, site.id, page.id, "PAGE_VIEW", false, 100, true);
    await seedEvent(organization.id, site.id, page.id, "CTA_CLICK", false, 10, true);
    // Treatment group: matched and personalized.
    await seedEvent(organization.id, site.id, page.id, "PAGE_VIEW", true, 100);
    await seedEvent(organization.id, site.id, page.id, "CTA_CLICK", true, 25);

    const analytics = await getOrgAnalytics(organization.id);
    const row = analytics.perSite.find((r) => r.siteId === site.id)!;
    expect(row.causalLift).not.toBeNull();
    expect(row.causalLift!.holdoutConversionRate).toBeCloseTo(0.1);
    expect(row.causalLift!.treatmentConversionRate).toBeCloseTo(0.25);
    expect(row.causalLift!.significance).not.toBeNull();
    expect(row.causalLift!.significance!.significant).toBe(true);
    expect(row.causalLift!.significance!.direction).toBe("higher");
  });

  it("flags a significant regression when the holdout group converts higher than treatment", async () => {
    const { organization } = await createOrgWithUser();
    const { site, page } = await seedSiteWithPage(organization.id, "https://example.com", 20);

    await seedEvent(organization.id, site.id, page.id, "PAGE_VIEW", false, 200, true);
    await seedEvent(organization.id, site.id, page.id, "CTA_CLICK", false, 60, true); // 30%
    await seedEvent(organization.id, site.id, page.id, "PAGE_VIEW", true, 200);
    await seedEvent(organization.id, site.id, page.id, "CTA_CLICK", true, 20); // 10%

    const analytics = await getOrgAnalytics(organization.id);
    const row = analytics.perSite.find((r) => r.siteId === site.id)!;
    expect(row.causalLift!.significance!.significant).toBe(true);
    expect(row.causalLift!.significance!.direction).toBe("lower");
  });

  // Caught live, not by a test — the first version of this rollup summed
  // every site's `personalized` count into the org-level treatment
  // bucket regardless of whether that site was running holdout at all,
  // pairing one site's real control group against a treatment count
  // inflated by an entirely unrelated site's ordinary personalized
  // traffic. This is the regression test for that fix.
  it("never blends a non-holdout site's personalized traffic into the org causal comparison", async () => {
    const { organization } = await createOrgWithUser();
    const { site: holdoutSite, page: holdoutPage } = await seedSiteWithPage(
      organization.id,
      "https://holdout.example.com",
      20,
    );
    const { site: plainSite, page: plainPage } = await seedSiteWithPage(
      organization.id,
      "https://plain.example.com",
      0,
    );

    // The holdout-enabled site: a real control/treatment split.
    await seedEvent(organization.id, holdoutSite.id, holdoutPage.id, "PAGE_VIEW", false, 50, true);
    await seedEvent(organization.id, holdoutSite.id, holdoutPage.id, "CTA_CLICK", false, 5, true);
    await seedEvent(organization.id, holdoutSite.id, holdoutPage.id, "PAGE_VIEW", true, 50);
    await seedEvent(organization.id, holdoutSite.id, holdoutPage.id, "CTA_CLICK", true, 15);

    // A different site with no holdout running at all — plenty of
    // personalized traffic, but none of it is part of any experiment.
    await seedEvent(organization.id, plainSite.id, plainPage.id, "PAGE_VIEW", true, 1000);
    await seedEvent(organization.id, plainSite.id, plainPage.id, "CTA_CLICK", true, 500);

    const analytics = await getOrgAnalytics(organization.id);
    // If the bug were present, treatmentPageViews would be 1050 (50 + 1000).
    expect(analytics.causalLift!.treatmentPageViews).toBe(50);
    expect(analytics.causalLift!.treatmentConversionRate).toBeCloseTo(0.3);
    expect(analytics.causalLift!.holdoutPageViews).toBe(50);
  });

  it("rolls causal lift up to org totals across a single holdout-enabled site", async () => {
    const { organization } = await createOrgWithUser();
    const { site, page } = await seedSiteWithPage(organization.id, "https://example.com", 20);

    await seedEvent(organization.id, site.id, page.id, "PAGE_VIEW", false, 50, true);
    await seedEvent(organization.id, site.id, page.id, "CTA_CLICK", false, 5, true);
    await seedEvent(organization.id, site.id, page.id, "PAGE_VIEW", true, 50);
    await seedEvent(organization.id, site.id, page.id, "CTA_CLICK", true, 15);

    const analytics = await getOrgAnalytics(organization.id);
    expect(analytics.causalLift).not.toBeNull();
    expect(analytics.causalLift!.holdoutConversionRate).toBeCloseTo(0.1);
    expect(analytics.causalLift!.treatmentConversionRate).toBeCloseTo(0.3);
  });
});
