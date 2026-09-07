import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  listConvertingPageCandidates,
  generateConvertingPage,
} from "@/lib/recommendations/convertingPages";
import { CrawledPageNotFoundError } from "@/lib/liveview/service";
import { resetDb } from "../setup/reset";
import { createOrgWithUser } from "../setup/factories";
import type { ContentElementType } from "@/generated/prisma/client";

afterEach(async () => {
  await resetDb();
});

async function seedCrawledPage(
  organizationId: string,
  elements: { elementType: ContentElementType; currentContent: string }[] = [],
) {
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

// This is the whole point of the feature: no SiteEvent (traffic) ever gets
// seeded anywhere in this file, unlike recommendations.test.ts's seedPageViews.
describe("listConvertingPageCandidates", () => {
  it("lists a freshly crawled page with no experience yet, with zero traffic required", async () => {
    const { organization } = await createOrgWithUser();
    const { page } = await seedCrawledPage(organization.id, [
      { elementType: "HEADLINE", currentContent: "Welcome to Acme" },
    ]);

    const candidates = await listConvertingPageCandidates(organization.id);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      crawledPageId: page.id,
      pageUrl: "https://example.com",
      pageTitle: "Example",
      experience: null,
    });
    expect(await prisma.siteEvent.count({ where: { organizationId: organization.id } })).toBe(0);
  });

  it("is org-scoped — never lists another org's crawled pages", async () => {
    const { organization: orgA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();
    await seedCrawledPage(orgB.id, [{ elementType: "HEADLINE", currentContent: "Welcome to Acme" }]);

    expect(await listConvertingPageCandidates(orgA.id)).toEqual([]);
  });

  it("reflects a generated experience once one exists, without a second generation call", async () => {
    const { organization } = await createOrgWithUser();
    const { page } = await seedCrawledPage(organization.id, [
      { elementType: "HEADLINE", currentContent: "Welcome to Acme" },
      { elementType: "HEADLINE", currentContent: "Acme helps teams ship faster" },
    ]);

    await generateConvertingPage(organization.id, page.id);
    const candidates = await listConvertingPageCandidates(organization.id);

    expect(candidates[0].experience).not.toBeNull();
    expect(candidates[0].experience?.status).toBe("PENDING");
  });
});

describe("generateConvertingPage", () => {
  it("creates a real 'Mobile visitors' audience and a PENDING experience from crawl data alone", async () => {
    const { organization } = await createOrgWithUser();
    const { page } = await seedCrawledPage(organization.id, [
      { elementType: "HEADLINE", currentContent: "Welcome to Acme" },
      { elementType: "HEADLINE", currentContent: "Acme helps teams ship faster" },
    ]);

    const experience = await generateConvertingPage(organization.id, page.id);

    expect(experience.status).toBe("PENDING");
    expect(experience.audienceName).toBe("Mobile visitors");
    expect(experience.rules.length).toBeGreaterThan(0);

    const audiences = await prisma.audience.findMany({
      where: { organizationId: organization.id },
      include: { rules: true },
    });
    expect(audiences).toHaveLength(1);
    expect(audiences[0].rules).toEqual([
      expect.objectContaining({ field: "device", operator: "EQUALS", value: "mobile" }),
    ]);
  });

  it("reuses an existing 'Mobile visitors' audience instead of creating a duplicate", async () => {
    const { organization } = await createOrgWithUser();
    const { page } = await seedCrawledPage(organization.id, [
      { elementType: "HEADLINE", currentContent: "Welcome to Acme" },
      { elementType: "HEADLINE", currentContent: "Acme helps teams ship faster" },
    ]);
    const existing = await prisma.audience.create({
      data: {
        organizationId: organization.id,
        name: "Mobile visitors",
        rules: { create: [{ organizationId: organization.id, field: "device", operator: "EQUALS", value: "mobile", groupIndex: 0 }] },
      },
    });

    const experience = await generateConvertingPage(organization.id, page.id);

    expect(experience.audienceId).toBe(existing.id);
    expect(await prisma.audience.count({ where: { organizationId: organization.id } })).toBe(1);
  });

  it("throws CrawledPageNotFoundError for a page that doesn't belong to the calling org", async () => {
    const { organization: orgA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();
    const { page } = await seedCrawledPage(orgB.id, [{ elementType: "HEADLINE", currentContent: "Welcome to Acme" }]);

    await expect(generateConvertingPage(orgA.id, page.id)).rejects.toThrow(CrawledPageNotFoundError);
    expect(await prisma.audience.count({ where: { organizationId: orgA.id } })).toBe(0);
  });
});
