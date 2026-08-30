import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  generateAllRecommendations,
  listAllRecommendations,
  acceptRecommendation,
  ignoreRecommendation,
  generateExperienceForRecommendation,
  RecommendationNotFoundError,
} from "@/lib/recommendations/service";
import { MIN_SAMPLE_SIZE } from "@/lib/recommendations/analyze";
import { resetDb } from "../setup/reset";
import { createOrgWithUser } from "../setup/factories";
import type { ContentElementType } from "@/generated/prisma/client";

afterEach(async () => {
  await resetDb();
});

async function seedSiteWithPage(organizationId: string, elements: { elementType: ContentElementType; currentContent: string }[] = []) {
  const site = await prisma.site.create({
    data: { organizationId, url: "https://example.com", status: "READY" },
  });
  const page = await prisma.crawledPage.create({
    data: { siteId: site.id, organizationId, url: "https://example.com" },
  });
  for (const [order, spec] of elements.entries()) {
    await prisma.contentElement.create({
      data: {
        crawledPageId: page.id,
        organizationId,
        section: "HERO",
        elementType: spec.elementType,
        selector: `#el-${order}`,
        currentContent: spec.currentContent,
        order,
      },
    });
  }
  return { site, page };
}

async function seedPageViews(
  organizationId: string,
  siteId: string,
  crawledPageId: string,
  contexts: object[],
) {
  await prisma.siteEvent.createMany({
    data: contexts.map((context) => ({
      organizationId,
      siteId,
      crawledPageId,
      type: "PAGE_VIEW",
      personalized: false,
      context,
    })),
  });
}

// docs/roadmap.md: the recommendation pipeline built on top of the pure
// analyze.ts thresholds — org-wide now (moved out of the per-site Sites
// panel into its own place under Tools), so generation and listing span
// every connected site in one call rather than requiring a siteId.
describe("recommendations (org-wide)", () => {
  it("generates a PENDING recommendation for a segment clearing both thresholds, across all of an org's sites", async () => {
    const { organization } = await createOrgWithUser();
    const { site, page } = await seedSiteWithPage(organization.id);

    await seedPageViews(organization.id, site.id, page.id, [
      ...Array(12).fill({ device: "mobile" }),
      ...Array(18).fill({ device: "desktop" }),
    ]);

    const recommendations = await generateAllRecommendations(organization.id);
    const mobile = recommendations.find((r) => r.field === "device" && r.value === "mobile");
    expect(mobile).toBeDefined();
    expect(mobile?.status).toBe("PENDING");
    expect(mobile?.matchingEvents).toBe(12);
    expect(mobile?.totalEvents).toBe(30);
    expect(mobile?.pageUrl).toBe("https://example.com");
    expect(mobile?.siteUrl).toBe("https://example.com");
    expect(mobile?.experience).toBeNull();
  });

  it("does not recommend a segment below the sample-size threshold", async () => {
    const { organization } = await createOrgWithUser();
    const { site, page } = await seedSiteWithPage(organization.id);

    await seedPageViews(
      organization.id,
      site.id,
      page.id,
      Array(MIN_SAMPLE_SIZE - 1).fill({ device: "mobile" }),
    );

    const recommendations = await generateAllRecommendations(organization.id);
    expect(recommendations).toEqual([]);
  });

  it("re-running generation refreshes stats without resurrecting an ignored recommendation", async () => {
    const { organization } = await createOrgWithUser();
    const { site, page } = await seedSiteWithPage(organization.id);

    await seedPageViews(organization.id, site.id, page.id, [
      ...Array(12).fill({ device: "mobile" }),
      ...Array(18).fill({ device: "desktop" }),
    ]);
    const first = await generateAllRecommendations(organization.id);
    const mobileRec = first.find((r) => r.field === "device" && r.value === "mobile")!;
    await ignoreRecommendation(organization.id, mobileRec.id);

    await seedPageViews(organization.id, site.id, page.id, Array(20).fill({ device: "mobile" }));
    const second = await generateAllRecommendations(organization.id);
    expect(second.find((r) => r.field === "device" && r.value === "mobile")).toBeUndefined();

    const stored = await prisma.recommendation.findUnique({ where: { id: mobileRec.id } });
    expect(stored?.status).toBe("IGNORED");
    expect(stored?.matchingEvents).toBe(32); // refreshed count, status untouched
  });

  it("only analyzes the calling org's own sites — never another org's traffic", async () => {
    const { organization: orgA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();
    const { site: siteB, page: pageB } = await seedSiteWithPage(orgB.id);

    await seedPageViews(orgB.id, siteB.id, pageB.id, [
      ...Array(12).fill({ device: "mobile" }),
      ...Array(18).fill({ device: "desktop" }),
    ]);

    const recommendationsForA = await generateAllRecommendations(orgA.id);
    expect(recommendationsForA).toEqual([]);

    const stillPendingForB = await prisma.recommendation.findMany({ where: { organizationId: orgB.id } });
    expect(stillPendingForB).toEqual([]); // org A's call never touched org B's site at all
  });

  it("listAllRecommendations is org-scoped", async () => {
    const { organization: orgA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();
    const { site, page } = await seedSiteWithPage(orgA.id);
    await seedPageViews(orgA.id, site.id, page.id, [
      ...Array(12).fill({ device: "mobile" }),
      ...Array(18).fill({ device: "desktop" }),
    ]);
    await generateAllRecommendations(orgA.id);

    expect(await listAllRecommendations(orgA.id)).not.toEqual([]);
    expect(await listAllRecommendations(orgB.id)).toEqual([]);
  });

  it("org A cannot accept or ignore org B's recommendation", async () => {
    const { organization: orgA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();
    const { site, page } = await seedSiteWithPage(orgB.id);

    await seedPageViews(orgB.id, site.id, page.id, [
      ...Array(12).fill({ device: "mobile" }),
      ...Array(18).fill({ device: "desktop" }),
    ]);
    const recommendations = await generateAllRecommendations(orgB.id);
    const mobile = recommendations.find((r) => r.field === "device" && r.value === "mobile")!;

    await expect(acceptRecommendation(orgA.id, mobile.id)).rejects.toThrow(RecommendationNotFoundError);
    await expect(ignoreRecommendation(orgA.id, mobile.id)).rejects.toThrow(RecommendationNotFoundError);

    const stored = await prisma.recommendation.findUnique({ where: { id: mobile.id } });
    expect(stored?.status).toBe("PENDING");
  });
});

// docs/roadmap.md: accepting now also tries to generate a coordinated
// full-experience content bundle in the same action, "based on data [the
// recommendation itself] and audiences [the Audience accept creates]" —
// folded into the Recommendations section rather than a separate manual
// "Full experience" flow. No ANTHROPIC_API_KEY exists in this test
// environment (same posture as generateExperience.test.ts), so every
// generation here exercises the real heuristic-reselection fallback, not
// a mocked AI call.
describe("acceptRecommendation auto-generates a full experience", () => {
  it("creates the audience and a real PENDING experience when generation has something to work with", async () => {
    const { organization } = await createOrgWithUser();
    const { site, page } = await seedSiteWithPage(organization.id, [
      { elementType: "HEADLINE", currentContent: "Welcome to Acme" },
      { elementType: "HEADLINE", currentContent: "Acme helps teams ship faster" },
    ]);
    await seedPageViews(organization.id, site.id, page.id, [
      ...Array(12).fill({ device: "mobile" }),
      ...Array(18).fill({ device: "desktop" }),
    ]);
    const [rec] = await generateAllRecommendations(organization.id);

    const result = await acceptRecommendation(organization.id, rec.id);

    expect(result.experienceError).toBeNull();
    expect(result.experience).not.toBeNull();
    expect(result.experience?.audienceId).toBe(result.audienceId);
    expect(result.experience?.status).toBe("PENDING");

    const audience = await prisma.audience.findUnique({ where: { id: result.audienceId }, include: { rules: true } });
    expect(audience?.rules).toHaveLength(1);

    // Reflected on the list too, re-derived at read time rather than cached.
    const listed = await listAllRecommendations(organization.id);
    const acceptedRow = listed.find((r) => r.id === rec.id);
    expect(acceptedRow?.status).toBe("ACCEPTED");
    expect(acceptedRow?.experience?.id).toBe(result.experience?.id);
  });

  it("still creates the audience even when generation produces nothing usable — accept never fails because of it", async () => {
    const { organization } = await createOrgWithUser();
    // A single HEADLINE with no site-wide alternative — nothing for the
    // heuristic fallback to offer.
    const { site, page } = await seedSiteWithPage(organization.id, [
      { elementType: "HEADLINE", currentContent: "Welcome to Acme" },
    ]);
    await seedPageViews(organization.id, site.id, page.id, [
      ...Array(12).fill({ device: "mobile" }),
      ...Array(18).fill({ device: "desktop" }),
    ]);
    const [rec] = await generateAllRecommendations(organization.id);

    const result = await acceptRecommendation(organization.id, rec.id);

    expect(result.experience).toBeNull();
    expect(result.experienceError).toBeTruthy();
    const audience = await prisma.audience.findUnique({ where: { id: result.audienceId } });
    expect(audience).not.toBeNull();

    const stored = await prisma.recommendation.findUnique({ where: { id: rec.id } });
    expect(stored?.status).toBe("ACCEPTED");
  });

  it("generateExperienceForRecommendation retries generation for an already-accepted recommendation", async () => {
    const { organization } = await createOrgWithUser();
    const { site, page } = await seedSiteWithPage(organization.id, [
      { elementType: "HEADLINE", currentContent: "Welcome to Acme" },
    ]);
    await seedPageViews(organization.id, site.id, page.id, [
      ...Array(12).fill({ device: "mobile" }),
      ...Array(18).fill({ device: "desktop" }),
    ]);
    const [rec] = await generateAllRecommendations(organization.id);
    const accepted = await acceptRecommendation(organization.id, rec.id);
    expect(accepted.experience).toBeNull(); // no candidate yet, matching the test above

    // A second HEADLINE shows up on the site later — now there's a real
    // candidate for the heuristic fallback to offer.
    await prisma.contentElement.create({
      data: {
        crawledPageId: page.id,
        organizationId: organization.id,
        section: "HERO",
        elementType: "HEADLINE",
        selector: "#el-1",
        currentContent: "Acme helps teams ship faster",
        order: 1,
      },
    });

    const retried = await generateExperienceForRecommendation(organization.id, rec.id);
    expect(retried.status).toBe("PENDING");
    expect(retried.rules.length).toBeGreaterThan(0);
  });

  it("generateExperienceForRecommendation refuses a PENDING (not yet accepted) recommendation", async () => {
    const { organization } = await createOrgWithUser();
    const { site, page } = await seedSiteWithPage(organization.id, [
      { elementType: "HEADLINE", currentContent: "Welcome to Acme" },
    ]);
    await seedPageViews(organization.id, site.id, page.id, [
      ...Array(12).fill({ device: "mobile" }),
      ...Array(18).fill({ device: "desktop" }),
    ]);
    const [rec] = await generateAllRecommendations(organization.id);

    await expect(generateExperienceForRecommendation(organization.id, rec.id)).rejects.toThrow(
      "Accept this recommendation before generating content for it.",
    );
  });
});

describe("acceptRecommendation audience semantics", () => {
  it("creates a real Audience and marks the recommendation ACCEPTED", async () => {
    const { organization } = await createOrgWithUser();
    const { site, page } = await seedSiteWithPage(organization.id);

    await seedPageViews(organization.id, site.id, page.id, [
      ...Array(15).fill({ utm: { source: "linkedin" } }),
      ...Array(15).fill({ utm: { source: "google" } }),
    ]);
    const recommendations = await generateAllRecommendations(organization.id);
    const linkedin = recommendations.find((r) => r.field === "utm.source" && r.value === "linkedin")!;

    const { audienceId } = await acceptRecommendation(organization.id, linkedin.id);
    const audience = await prisma.audience.findUnique({ where: { id: audienceId }, include: { rules: true } });
    expect(audience).not.toBeNull();
    expect(audience?.rules).toHaveLength(1);
    expect(audience?.rules[0]).toMatchObject({ field: "utm.source", operator: "EQUALS", value: "linkedin" });

    const stored = await prisma.recommendation.findUnique({ where: { id: linkedin.id } });
    expect(stored?.status).toBe("ACCEPTED");
  });

  it("accepting a referrer recommendation creates a CONTAINS rule, not EQUALS", async () => {
    const { organization } = await createOrgWithUser();
    const { site, page } = await seedSiteWithPage(organization.id);

    await seedPageViews(organization.id, site.id, page.id, [
      ...Array(15).fill({ referrer: "https://www.linkedin.com/feed/" }),
      ...Array(15).fill({ referrer: "https://google.com/search" }),
    ]);
    const recommendations = await generateAllRecommendations(organization.id);
    const linkedin = recommendations.find((r) => r.field === "referrer")!;
    expect(linkedin.value).toBe("linkedin.com");

    const { audienceId } = await acceptRecommendation(organization.id, linkedin.id);
    const audience = await prisma.audience.findUnique({ where: { id: audienceId }, include: { rules: true } });
    expect(audience?.rules[0]).toMatchObject({ field: "referrer", operator: "CONTAINS", value: "linkedin.com" });
  });

  it("accepting a second recommendation for the same segment reuses the existing audience", async () => {
    const { organization } = await createOrgWithUser();
    const { site, page } = await seedSiteWithPage(organization.id);
    const page2 = await prisma.crawledPage.create({
      data: { siteId: site.id, organizationId: organization.id, url: "https://example.com/pricing" },
    });

    await seedPageViews(organization.id, site.id, page.id, [
      ...Array(12).fill({ device: "mobile" }),
      ...Array(18).fill({ device: "desktop" }),
    ]);
    await seedPageViews(organization.id, site.id, page2.id, [
      ...Array(12).fill({ device: "mobile" }),
      ...Array(18).fill({ device: "desktop" }),
    ]);

    const recommendations = await generateAllRecommendations(organization.id);
    const mobileRecs = recommendations.filter((r) => r.field === "device" && r.value === "mobile");
    expect(mobileRecs).toHaveLength(2);

    const first = await acceptRecommendation(organization.id, mobileRecs[0].id);
    const second = await acceptRecommendation(organization.id, mobileRecs[1].id);
    expect(second.audienceId).toBe(first.audienceId);

    const count = await prisma.audience.count({ where: { organizationId: organization.id } });
    expect(count).toBe(1);
  });
});
