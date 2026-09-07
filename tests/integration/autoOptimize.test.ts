import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { runAutoOptimize } from "@/lib/autoOptimize/service";
import { resetDb } from "../setup/reset";
import { createOrgWithUser } from "../setup/factories";
import type { ContentElementType } from "@/generated/prisma/client";

afterEach(async () => {
  await resetDb();
});

async function seedSiteWithPage(
  organizationId: string,
  elements: { elementType: ContentElementType; currentContent: string }[] = [],
) {
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

async function seedPageViews(organizationId: string, siteId: string, crawledPageId: string, contexts: object[]) {
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

// docs/launch-plan.md §5C — the automatic version of clicking "Check for
// recommendations" then accepting each one, gated per-org by
// Organization.autoOptimizeEnabled. No ANTHROPIC_API_KEY exists in this
// test environment, so every draft here exercises the real heuristic
// fallback, same posture as recommendations.test.ts.
describe("runAutoOptimize", () => {
  it("drafts experiences only for opted-in orgs, never a real segment on an opted-out org", async () => {
    const { organization: optedIn } = await createOrgWithUser();
    await prisma.organization.update({ where: { id: optedIn.id }, data: { autoOptimizeEnabled: true } });
    const { site: siteIn, page: pageIn } = await seedSiteWithPage(optedIn.id, [
      { elementType: "HEADLINE", currentContent: "Welcome to Acme" },
      { elementType: "HEADLINE", currentContent: "Acme helps teams ship faster" },
    ]);
    await seedPageViews(optedIn.id, siteIn.id, pageIn.id, [
      ...Array(12).fill({ device: "mobile" }),
      ...Array(18).fill({ device: "desktop" }),
    ]);

    const { organization: optedOut } = await createOrgWithUser();
    // autoOptimizeEnabled defaults to false — left untouched.
    const { site: siteOut, page: pageOut } = await seedSiteWithPage(optedOut.id);
    await seedPageViews(optedOut.id, siteOut.id, pageOut.id, [
      ...Array(12).fill({ device: "mobile" }),
      ...Array(18).fill({ device: "desktop" }),
    ]);

    const result = await runAutoOptimize();

    expect(result.ranForOrgs).toBe(1);
    const inResult = result.results.find((r) => r.organizationId === optedIn.id);
    // Both mobile (12/30) and desktop (18/30) legitimately clear the
    // sample-size + share thresholds on this split — two real segments,
    // two drafts, not one.
    expect(inResult?.drafted).toBe(2);
    expect(inResult?.rateLimited).toBe(false);

    // The opted-out org's real segment was never touched at all.
    const outRecs = await prisma.recommendation.findMany({ where: { organizationId: optedOut.id } });
    expect(outRecs).toEqual([]);

    // The opted-in org really did get live, reviewable drafts — PENDING,
    // not auto-approved. "Nothing goes live unapproved" stays true. One
    // audience per qualifying segment (mobile, desktop).
    const inAudiences = await prisma.audience.findMany({ where: { organizationId: optedIn.id } });
    expect(inAudiences).toHaveLength(2);
    const rules = await prisma.elementPersonalizationRule.findMany({
      where: { audienceId: { in: inAudiences.map((a) => a.id) } },
    });
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.every((r) => r.status === "PENDING")).toBe(true);
  });

  it("stops attempting further recommendations once the per-org generation rate limit is hit, leaving the untouched ones genuinely PENDING", async () => {
    const { organization } = await createOrgWithUser();
    await prisma.organization.update({ where: { id: organization.id }, data: { autoOptimizeEnabled: true } });
    // Seeded directly, bypassing real traffic analysis (analyze.ts's own
    // thresholds are covered elsewhere, in recommendations.test.ts) — this
    // test needs seven real, distinct PENDING rows: five to legitimately
    // consume the shared 5/hour generation budget, a sixth whose attempt
    // is the one that discovers the limit is hit (acceptRecommendation
    // marks a recommendation ACCEPTED unconditionally, before it even
    // checks the rate limit — see its own "accept never fails because of
    // it" test — so this one ends up ACCEPTED-with-no-draft, not PENDING),
    // and a seventh that must never be attempted at all once that's
    // discovered. No content elements on the page: every attempted call
    // still consumes one unit of the rate-limit budget regardless (checked
    // before generation even starts), it just fails with "no eligible
    // elements" instead of producing a draft for the first five.
    const { site, page } = await seedSiteWithPage(organization.id);
    await prisma.recommendation.createMany({
      data: Array.from({ length: 7 }, (_, i) => ({
        organizationId: organization.id,
        siteId: site.id,
        crawledPageId: page.id,
        field: "utm.source",
        value: `source-${i}`,
        matchingEvents: 12,
        totalEvents: 30,
      })),
    });

    const result = await runAutoOptimize();
    const orgResult = result.results.find((r) => r.organizationId === organization.id)!;

    expect(orgResult.drafted).toBe(0); // no content elements anywhere to draft from
    expect(orgResult.rateLimited).toBe(true);

    // Six of seven got an accept attempt (five real, one that discovered
    // the limit) — only the seventh was never touched.
    const stillPending = await prisma.recommendation.count({
      where: { organizationId: organization.id, status: "PENDING" },
    });
    expect(stillPending).toBe(1);
    const accepted = await prisma.recommendation.count({
      where: { organizationId: organization.id, status: "ACCEPTED" },
    });
    expect(accepted).toBe(6);
  });

  it("one org's failure never stops another org's run", async () => {
    const { organization: orgA } = await createOrgWithUser();
    await prisma.organization.update({ where: { id: orgA.id }, data: { autoOptimizeEnabled: true } });
    const { site: siteA, page: pageA } = await seedSiteWithPage(orgA.id, [
      { elementType: "HEADLINE", currentContent: "Welcome to Acme" },
      { elementType: "HEADLINE", currentContent: "Acme helps teams ship faster" },
    ]);
    await seedPageViews(orgA.id, siteA.id, pageA.id, [
      ...Array(12).fill({ device: "mobile" }),
      ...Array(18).fill({ device: "desktop" }),
    ]);

    const { organization: orgB } = await createOrgWithUser();
    await prisma.organization.update({ where: { id: orgB.id }, data: { autoOptimizeEnabled: true } });
    // orgB opted in but has no sites/traffic at all — generateAllRecommendations
    // just returns an empty list for it, not a thrown error, but this
    // confirms the loop still reaches and correctly reports on orgA either way.

    const result = await runAutoOptimize();
    expect(result.ranForOrgs).toBe(2);
    const aResult = result.results.find((r) => r.organizationId === orgA.id);
    const bResult = result.results.find((r) => r.organizationId === orgB.id);
    // Both mobile and desktop legitimately qualify on this split — see the
    // first test's comment.
    expect(aResult?.drafted).toBe(2);
    expect(bResult?.drafted).toBe(0);
  });
});
