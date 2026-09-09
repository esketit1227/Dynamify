import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { listContentPages, getContentPageSummary, getSiteWideImageLibrary } from "@/lib/content/service";
import { CrawledPageNotFoundError } from "@/lib/liveview/service";
import { createElementPersonalization, approveElementPersonalizationRule } from "@/lib/sites/personalization";
import { resetDb } from "../setup/reset";
import { createOrgWithUser } from "../setup/factories";
import type { ContentElementType, ContentSection } from "@/generated/prisma/client";

afterEach(async () => {
  await resetDb();
});

async function seedCrawledPage(
  organizationId: string,
  siteUrl: string,
  elements: { elementType: ContentElementType; section: ContentSection; currentContent: string }[] = [],
) {
  const site = await prisma.site.create({
    data: { organizationId, url: siteUrl, status: "READY" },
  });
  const page = await prisma.crawledPage.create({
    data: { siteId: site.id, organizationId, url: siteUrl, title: "Example" },
  });
  const created = [];
  for (const [order, spec] of elements.entries()) {
    created.push(
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
      }),
    );
  }
  return { site, page, elements: created };
}

describe("listContentPages", () => {
  it("lists a freshly crawled page with correct counts and headline, zero personalization", async () => {
    const { organization } = await createOrgWithUser();
    const { page } = await seedCrawledPage(organization.id, "https://example.com", [
      { elementType: "HEADLINE", section: "HERO", currentContent: "Welcome to Acme" },
      { elementType: "BODY", section: "HERO", currentContent: "We help teams ship faster." },
    ]);

    const pages = await listContentPages(organization.id);

    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({
      id: page.id,
      elementCount: 2,
      personalizedElementCount: 0,
      headline: "Welcome to Acme",
      siteHostname: "example.com",
    });
  });

  it("buckets sectionCounts correctly across multiple sections", async () => {
    const { organization } = await createOrgWithUser();
    await seedCrawledPage(organization.id, "https://example.com", [
      { elementType: "HEADLINE", section: "HERO", currentContent: "Welcome" },
      { elementType: "BODY", section: "HERO", currentContent: "Intro copy" },
      { elementType: "BODY", section: "FEATURES", currentContent: "Feature one" },
      { elementType: "BODY", section: "FEATURES", currentContent: "Feature two" },
      { elementType: "BODY", section: "FEATURES", currentContent: "Feature three" },
    ]);

    const pages = await listContentPages(organization.id);
    const bySection = Object.fromEntries(pages[0].sectionCounts.map((s) => [s.section, s.count]));

    expect(bySection).toEqual({ HERO: 2, FEATURES: 3 });
  });

  it("personalizedElementCount only counts APPROVED rules, not PENDING or DISABLED", async () => {
    const { organization } = await createOrgWithUser();
    const { page, elements } = await seedCrawledPage(organization.id, "https://example.com", [
      { elementType: "HEADLINE", section: "HERO", currentContent: "Welcome" },
      { elementType: "BODY", section: "HERO", currentContent: "Intro copy" },
      { elementType: "BODY", section: "FEATURES", currentContent: "Feature one" },
    ]);
    const audience = await prisma.audience.create({ data: { organizationId: organization.id, name: "Mobile visitors" } });

    // Element 0: approved (counts). Element 1: left PENDING (doesn't count).
    const rule0 = await createElementPersonalization(organization.id, elements[0].id, {
      audienceId: audience.id,
      method: "MANUAL",
      content: "Personalized headline",
      priority: 0,
    });
    await approveElementPersonalizationRule(organization.id, rule0.id);
    await createElementPersonalization(organization.id, elements[1].id, {
      audienceId: audience.id,
      method: "MANUAL",
      content: "Personalized body",
      priority: 0,
    });

    const pages = await listContentPages(organization.id);
    expect(pages.find((p) => p.id === page.id)?.personalizedElementCount).toBe(1);
  });

  it("headline is null with no HEADLINE element, and picks the first by order when several exist", async () => {
    const { organization } = await createOrgWithUser();
    await seedCrawledPage(organization.id, "https://example.com/no-headline", [
      { elementType: "BODY", section: "HERO", currentContent: "Just body text" },
    ]);
    await seedCrawledPage(organization.id, "https://example.com/two-headlines", [
      { elementType: "HEADLINE", section: "HERO", currentContent: "First headline" },
      { elementType: "HEADLINE", section: "FEATURES", currentContent: "Second headline" },
    ]);

    const pages = await listContentPages(organization.id);
    const noHeadlinePage = pages.find((p) => p.url.endsWith("/no-headline"));
    const twoHeadlinesPage = pages.find((p) => p.url.endsWith("/two-headlines"));

    expect(noHeadlinePage?.headline).toBeNull();
    expect(twoHeadlinesPage?.headline).toBe("First headline");
  });

  it("picks up subheadline and CTA label alongside the headline, for the card's mini preview", async () => {
    const { organization } = await createOrgWithUser();
    await seedCrawledPage(organization.id, "https://example.com", [
      { elementType: "HEADLINE", section: "HERO", currentContent: "Ship personalized pages" },
      { elementType: "SUBHEADLINE", section: "HERO", currentContent: "One page, every visitor." },
      { elementType: "BODY", section: "HERO", currentContent: "Not part of the mini preview." },
      { elementType: "CTA_LABEL", section: "HERO", currentContent: "Get started" },
    ]);

    const pages = await listContentPages(organization.id);

    expect(pages[0]).toMatchObject({
      headline: "Ship personalized pages",
      subheadline: "One page, every visitor.",
      ctaLabel: "Get started",
    });
  });

  it("subheadline and ctaLabel are null when the page has neither, independent of the headline", async () => {
    const { organization } = await createOrgWithUser();
    await seedCrawledPage(organization.id, "https://example.com", [
      { elementType: "HEADLINE", section: "HERO", currentContent: "Just a headline" },
    ]);

    const pages = await listContentPages(organization.id);

    expect(pages[0]).toMatchObject({ headline: "Just a headline", subheadline: null, ctaLabel: null });
  });

  it("picks the first CTA_LABEL by order when a page has more than one", async () => {
    const { organization } = await createOrgWithUser();
    await seedCrawledPage(organization.id, "https://example.com", [
      { elementType: "CTA_LABEL", section: "HERO", currentContent: "Start free trial" },
      { elementType: "CTA_LABEL", section: "FEATURES", currentContent: "See pricing" },
    ]);

    const pages = await listContentPages(organization.id);

    expect(pages[0].ctaLabel).toBe("Start free trial");
  });

  it("is org-scoped — never lists another org's pages", async () => {
    const { organization: orgA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();
    await seedCrawledPage(orgB.id, "https://example.com", [
      { elementType: "HEADLINE", section: "HERO", currentContent: "Org B headline" },
    ]);

    expect(await listContentPages(orgA.id)).toEqual([]);
  });

  it("returns an empty array for an org with no crawled pages", async () => {
    const { organization } = await createOrgWithUser();
    expect(await listContentPages(organization.id)).toEqual([]);
  });
});

describe("getContentPageSummary", () => {
  it("returns the page's summary", async () => {
    const { organization } = await createOrgWithUser();
    const { page } = await seedCrawledPage(organization.id, "https://acme.example.com", []);

    const summary = await getContentPageSummary(organization.id, page.id);
    expect(summary).toMatchObject({ id: page.id, siteHostname: "acme.example.com" });
  });

  it("throws CrawledPageNotFoundError for a page belonging to a different org", async () => {
    const { organization: orgA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();
    const { page } = await seedCrawledPage(orgB.id, "https://example.com", []);

    await expect(getContentPageSummary(orgA.id, page.id)).rejects.toThrow(CrawledPageNotFoundError);
  });
});

describe("getSiteWideImageLibrary", () => {
  it("pulls IMAGE/LOGO/CTA_HREF content from sibling pages of the same site, not just one", async () => {
    const { organization } = await createOrgWithUser();
    const site = await prisma.site.create({ data: { organizationId: organization.id, url: "https://example.com", status: "READY" } });
    const pageA = await prisma.crawledPage.create({ data: { siteId: site.id, organizationId: organization.id, url: "https://example.com/a" } });
    const pageB = await prisma.crawledPage.create({ data: { siteId: site.id, organizationId: organization.id, url: "https://example.com/b" } });
    await prisma.contentElement.create({
      data: { crawledPageId: pageA.id, organizationId: organization.id, section: "HERO", elementType: "IMAGE", selector: "img", currentContent: "https://example.com/a.jpg", order: 0 },
    });
    await prisma.contentElement.create({
      data: { crawledPageId: pageB.id, organizationId: organization.id, section: "HERO", elementType: "IMAGE", selector: "img", currentContent: "https://example.com/b.jpg", order: 0 },
    });
    await prisma.contentElement.create({
      data: { crawledPageId: pageB.id, organizationId: organization.id, section: "HERO", elementType: "BODY", selector: "p", currentContent: "Not an image type", order: 1 },
    });

    const library = await getSiteWideImageLibrary(organization.id, site.id);

    expect(library.IMAGE?.sort()).toEqual(["https://example.com/a.jpg", "https://example.com/b.jpg"]);
  });

  it("never pulls from a different site", async () => {
    const { organization } = await createOrgWithUser();
    const siteA = await prisma.site.create({ data: { organizationId: organization.id, url: "https://a.example.com", status: "READY" } });
    const siteB = await prisma.site.create({ data: { organizationId: organization.id, url: "https://b.example.com", status: "READY" } });
    const pageB = await prisma.crawledPage.create({ data: { siteId: siteB.id, organizationId: organization.id, url: "https://b.example.com" } });
    await prisma.contentElement.create({
      data: { crawledPageId: pageB.id, organizationId: organization.id, section: "HERO", elementType: "IMAGE", selector: "img", currentContent: "https://b.example.com/hero.jpg", order: 0 },
    });

    const library = await getSiteWideImageLibrary(organization.id, siteA.id);
    expect(library.IMAGE ?? []).toEqual([]);
  });
});
