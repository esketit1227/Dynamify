import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  listPageDesignCandidates,
  generateNewPageDesign,
  getPageDesign,
  endorsePageDesign,
  rejectPageDesign,
  PageDesignNotFoundError,
  NoDesignableContentError,
} from "@/lib/sites/designPage";
import { generateConvertingPage } from "@/lib/recommendations/convertingPages";
import { CrawledPageNotFoundError } from "@/lib/liveview/service";
import { RateLimitedError } from "@/lib/auth/errors";
import { resetDb } from "../setup/reset";
import { createOrgWithUser } from "../setup/factories";
import type { ContentSection, ContentElementType } from "@/generated/prisma/client";

afterEach(async () => {
  await resetDb();
});

type ElementSpec = { section: ContentSection; elementType: ContentElementType; currentContent: string };

// A page with enough real content for the heuristic composer to produce a
// design (HERO + FEATURES, both real) but with no ANTHROPIC_API_KEY in this
// test environment, every generateNewPageDesign call here exercises the
// real heuristic path — never a mocked AI call, matching this codebase's
// stated convention (see convertingPages.test.ts / generateExperience.test.ts).
const DESIGNABLE_ELEMENTS: ElementSpec[] = [
  { section: "HERO", elementType: "HEADLINE", currentContent: "Welcome to Acme" },
  { section: "HERO", elementType: "SUBHEADLINE", currentContent: "Manage your team's work in one place" },
  { section: "FEATURES", elementType: "BODY", currentContent: "Real-time collaboration for every team." },
  { section: "FEATURES", elementType: "BODY", currentContent: "Deep integrations with your existing tools." },
  { section: "CTA", elementType: "CTA_LABEL", currentContent: "Start your free trial" },
];

async function seedCrawledPage(organizationId: string, elements: ElementSpec[] = DESIGNABLE_ELEMENTS) {
  const site = await prisma.site.create({
    data: { organizationId, url: "https://example.com", status: "READY" },
  });
  const page = await prisma.crawledPage.create({
    data: { siteId: site.id, organizationId, url: "https://example.com", title: "Example" },
  });
  for (const [order, spec] of elements.entries()) {
    await prisma.contentElement.create({
      data: {
        crawledPageId: page.id,
        organizationId,
        section: spec.section,
        elementType: spec.elementType,
        selector: `#el-${order}`,
        currentContent: spec.currentContent,
        order,
      },
    });
  }
  return { site, page };
}

async function deliveryArtifactCounts(organizationId: string) {
  const [audiences, rules, variants, experiences] = await Promise.all([
    prisma.audience.count({ where: { organizationId } }),
    prisma.elementPersonalizationRule.count({ where: { organizationId } }),
    prisma.elementVariant.count({ where: { organizationId } }),
    prisma.generatedExperience.count({ where: { organizationId } }),
  ]);
  return { audiences, rules, variants, experiences };
}

describe("listPageDesignCandidates", () => {
  it("lists a freshly crawled page with no design yet, zero traffic required", async () => {
    const { organization } = await createOrgWithUser();
    const { page } = await seedCrawledPage(organization.id);

    const candidates = await listPageDesignCandidates(organization.id);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ crawledPageId: page.id, pageUrl: "https://example.com", design: null });
    expect(await prisma.siteEvent.count({ where: { organizationId: organization.id } })).toBe(0);
  });

  it("is org-scoped — never lists another org's crawled pages", async () => {
    const { organization: orgA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();
    await seedCrawledPage(orgB.id);

    expect(await listPageDesignCandidates(orgA.id)).toEqual([]);
  });

  it("reflects the most recent design once one exists", async () => {
    const { organization } = await createOrgWithUser();
    const { page } = await seedCrawledPage(organization.id);

    const first = await generateNewPageDesign(organization.id, page.id);
    const second = await generateNewPageDesign(organization.id, page.id);
    const candidates = await listPageDesignCandidates(organization.id);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].design?.id).toBe(second.id);
    expect(candidates[0].design?.id).not.toBe(first.id);
  });
});

describe("generateNewPageDesign", () => {
  it("creates a PENDING, HEURISTIC design with >=2 sections from crawl data alone", async () => {
    const { organization } = await createOrgWithUser();
    const { page } = await seedCrawledPage(organization.id);

    const design = await generateNewPageDesign(organization.id, page.id);

    expect(design.status).toBe("PENDING");
    expect(design.method).toBe("HEURISTIC");
    expect(design.marketContext).toBe("");
    expect(design.marketSources).toEqual([]);
    expect(design.sections.length).toBeGreaterThanOrEqual(2);
    expect(design.pageUrl).toBe("https://example.com");
  });

  it("D9: with no TAVILY_API_KEY configured, market research is skipped gracefully and page generation still succeeds", async () => {
    // No TAVILY_API_KEY exists in this test environment (see
    // tests/unit/search/tavily.test.ts) — this proves the unconfigured
    // search provider degrades exactly like every other optional
    // integration here: no market context/sources, not a thrown error
    // that blocks the whole generation.
    const { organization } = await createOrgWithUser();
    const { page } = await seedCrawledPage(organization.id);

    const design = await generateNewPageDesign(organization.id, page.id);

    expect(design.marketContext).toBe("");
    expect(design.marketSources).toEqual([]);
    expect(design.sections.length).toBeGreaterThanOrEqual(2);

    const stored = await prisma.pageDesign.findFirstOrThrow({ where: { id: design.id } });
    expect(stored.marketSources).toEqual([]);
  });

  it("D8 boundary: generating creates no Audience/rule/variant/experience row at all", async () => {
    const { organization } = await createOrgWithUser();
    const { page } = await seedCrawledPage(organization.id);

    await generateNewPageDesign(organization.id, page.id);

    expect(await deliveryArtifactCounts(organization.id)).toEqual({
      audiences: 0,
      rules: 0,
      variants: 0,
      experiences: 0,
    });
  });

  it("includes a real TESTIMONIALS section when real testimonial content was crawled", async () => {
    const { organization } = await createOrgWithUser();
    const quote = "This product completely changed how our team ships work every week.";
    const { page } = await seedCrawledPage(organization.id, [
      ...DESIGNABLE_ELEMENTS,
      { section: "TESTIMONIALS", elementType: "BODY", currentContent: quote },
    ]);

    const design = await generateNewPageDesign(organization.id, page.id);
    const testimonials = design.sections.find((s) => s.section === "TESTIMONIALS");

    expect(testimonials).toBeDefined();
    expect(testimonials?.quotes).toEqual([quote]);

    const stored = await prisma.pageDesign.findFirstOrThrow({ where: { id: design.id } });
    expect((stored.sections as { section: string }[]).some((s) => s.section === "TESTIMONIALS")).toBe(true);
  });

  it("never fabricates a TESTIMONIALS section when no real testimonial content was crawled", async () => {
    const { organization } = await createOrgWithUser();
    const { page } = await seedCrawledPage(organization.id);

    const design = await generateNewPageDesign(organization.id, page.id);

    expect(design.sections.some((s) => s.section === "TESTIMONIALS")).toBe(false);
  });

  it("never treats a testimonials-section logo image or heading as a real quote", async () => {
    const { organization } = await createOrgWithUser();
    const { page } = await seedCrawledPage(organization.id, [
      ...DESIGNABLE_ELEMENTS,
      { section: "TESTIMONIALS", elementType: "LOGO", currentContent: "https://example.com/logo.png" },
      { section: "TESTIMONIALS", elementType: "HEADLINE", currentContent: "Customer stories" },
    ]);

    const design = await generateNewPageDesign(organization.id, page.id);

    expect(design.sections.some((s) => s.section === "TESTIMONIALS")).toBe(false);
  });

  it("throws CrawledPageNotFoundError for another org's page and creates no row", async () => {
    const { organization: orgA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();
    const { page } = await seedCrawledPage(orgB.id);

    await expect(generateNewPageDesign(orgA.id, page.id)).rejects.toThrow(CrawledPageNotFoundError);
    expect(await prisma.pageDesign.count({ where: { organizationId: orgA.id } })).toBe(0);
  });

  it("throws NoDesignableContentError for a page with no crawled elements", async () => {
    const { organization } = await createOrgWithUser();
    const { page } = await seedCrawledPage(organization.id, []);

    await expect(generateNewPageDesign(organization.id, page.id)).rejects.toThrow(NoDesignableContentError);
    expect(await prisma.pageDesign.count({ where: { organizationId: organization.id } })).toBe(0);
  });

  it("rate-limits at 3/hour and the 4th call throws RateLimitedError", async () => {
    const { organization } = await createOrgWithUser();
    const { page } = await seedCrawledPage(organization.id);

    await generateNewPageDesign(organization.id, page.id);
    await generateNewPageDesign(organization.id, page.id);
    await generateNewPageDesign(organization.id, page.id);

    await expect(generateNewPageDesign(organization.id, page.id)).rejects.toThrow(RateLimitedError);
  });

  it("uses a budget independent from generate-experience's — exhausting one leaves the other usable", async () => {
    const { organization } = await createOrgWithUser();
    const { page } = await seedCrawledPage(organization.id);

    await generateNewPageDesign(organization.id, page.id);
    await generateNewPageDesign(organization.id, page.id);
    await generateNewPageDesign(organization.id, page.id);
    await expect(generateNewPageDesign(organization.id, page.id)).rejects.toThrow(RateLimitedError);

    // A separate feature/budget entirely — must still succeed.
    await expect(generateConvertingPage(organization.id, page.id)).resolves.toBeDefined();
  });
});

describe("getPageDesign / endorsePageDesign / rejectPageDesign", () => {
  it("each throws PageDesignNotFoundError for another org's design, and the row is untouched", async () => {
    const { organization: orgA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();
    const { page } = await seedCrawledPage(orgB.id);
    const design = await generateNewPageDesign(orgB.id, page.id);

    await expect(getPageDesign(orgA.id, design.id)).rejects.toThrow(PageDesignNotFoundError);
    await expect(endorsePageDesign(orgA.id, design.id)).rejects.toThrow(PageDesignNotFoundError);
    await expect(rejectPageDesign(orgA.id, design.id)).rejects.toThrow(PageDesignNotFoundError);

    const stored = await prisma.pageDesign.findUniqueOrThrow({ where: { id: design.id } });
    expect(stored.status).toBe("PENDING");
  });

  it("endorse moves PENDING -> ENDORSED, is idempotent, and creates no delivery artifact", async () => {
    const { organization } = await createOrgWithUser();
    const { page } = await seedCrawledPage(organization.id);
    const design = await generateNewPageDesign(organization.id, page.id);

    const endorsed = await endorsePageDesign(organization.id, design.id);
    expect(endorsed.status).toBe("ENDORSED");

    const endorsedAgain = await endorsePageDesign(organization.id, design.id);
    expect(endorsedAgain.status).toBe("ENDORSED");

    expect(await deliveryArtifactCounts(organization.id)).toEqual({
      audiences: 0,
      rules: 0,
      variants: 0,
      experiences: 0,
    });
  });

  it("reject hard-deletes the row; a second reject 404s", async () => {
    const { organization } = await createOrgWithUser();
    const { page } = await seedCrawledPage(organization.id);
    const design = await generateNewPageDesign(organization.id, page.id);

    await rejectPageDesign(organization.id, design.id);

    expect(await prisma.pageDesign.findUnique({ where: { id: design.id } })).toBeNull();
    await expect(rejectPageDesign(organization.id, design.id)).rejects.toThrow(PageDesignNotFoundError);
  });
});
