import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  listPendingExperiences,
  countPendingExperiences,
  getGeneratedExperience,
  approveAllGeneratedExperience,
} from "@/lib/sites/generateExperience";
import { generateConvertingPage } from "@/lib/recommendations/convertingPages";
import { updateElementPersonalizationRuleContent, approveElementPersonalizationRule } from "@/lib/sites/personalization";
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

const TWO_HEADLINES: { elementType: ContentElementType; currentContent: string }[] = [
  { elementType: "HEADLINE", currentContent: "Welcome to Acme" },
  { elementType: "HEADLINE", currentContent: "Acme helps teams ship faster" },
];

// Home's "Ready for your review" feed (src/components/dashboard/
// pending-experiences-feed.tsx) and /recommendations both read through
// this — one org-wide aggregator, not two representations of the same row.
describe("listPendingExperiences", () => {
  it("returns PENDING and PARTIALLY_APPROVED experiences", async () => {
    const { organization } = await createOrgWithUser();
    const { page } = await seedCrawledPage(organization.id, TWO_HEADLINES);
    const experience = await generateConvertingPage(organization.id, page.id);

    const pending = await listPendingExperiences(organization.id);
    expect(pending.map((e) => e.id)).toContain(experience.id);

    // Approving one of several rules (not all) moves it to PARTIALLY_APPROVED —
    // still a reviewable, in-progress experience, still in the feed.
    await approveElementPersonalizationRule(organization.id, experience.rules[0].id);
    const partially = await getGeneratedExperience(organization.id, experience.id);
    expect(partially.status).toBe("PARTIALLY_APPROVED");
    expect((await listPendingExperiences(organization.id)).map((e) => e.id)).toContain(experience.id);
  });

  it("excludes APPROVED and REJECTED experiences", async () => {
    const { organization } = await createOrgWithUser();
    const { page } = await seedCrawledPage(organization.id, TWO_HEADLINES);
    const experience = await generateConvertingPage(organization.id, page.id);

    await approveAllGeneratedExperience(organization.id, experience.id);
    expect((await listPendingExperiences(organization.id)).map((e) => e.id)).not.toContain(experience.id);
  });

  it("is org-scoped — never lists another org's experiences", async () => {
    const { organization: orgA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();
    const { page } = await seedCrawledPage(orgB.id, TWO_HEADLINES);
    await generateConvertingPage(orgB.id, page.id);

    expect(await listPendingExperiences(orgA.id)).toEqual([]);
  });

  it("respects a take limit while countPendingExperiences reports the true total", async () => {
    const { organization } = await createOrgWithUser();
    for (let i = 0; i < 3; i++) {
      const { page } = await seedCrawledPage(organization.id, TWO_HEADLINES);
      await generateConvertingPage(organization.id, page.id);
    }

    const capped = await listPendingExperiences(organization.id, { take: 2 });
    const total = await countPendingExperiences(organization.id);
    const uncapped = await listPendingExperiences(organization.id);

    expect(capped).toHaveLength(2);
    expect(total).toBe(3);
    expect(uncapped).toHaveLength(3);
  });

  it("an edit followed by approve is reflected on a fresh read — not the pre-edit content", async () => {
    const { organization } = await createOrgWithUser();
    const { page } = await seedCrawledPage(organization.id, TWO_HEADLINES);
    const experience = await generateConvertingPage(organization.id, page.id);
    const rule = experience.rules[0];

    await updateElementPersonalizationRuleContent(organization.id, rule.id, "Rewritten by a human reviewer");
    await approveElementPersonalizationRule(organization.id, rule.id);

    const refetched = await getGeneratedExperience(organization.id, experience.id);
    const refetchedRule = refetched.rules.find((r) => r.id === rule.id);
    expect(refetchedRule?.content).toBe("Rewritten by a human reviewer");
    expect(refetchedRule?.status).toBe("APPROVED");
    expect(refetchedRule?.method).toBe("MANUAL");
  });
});
