import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  generateExperience,
  getGeneratedExperience,
  approveAllGeneratedExperience,
  rejectAllGeneratedExperience,
  NoEligibleElementsError,
  NoContentGeneratedError,
  GeneratedExperienceNotFoundError,
} from "@/lib/sites/generateExperience";
import { CrawledPageNotFoundError } from "@/lib/liveview/service";
import { AudienceNotFoundError, disableElementPersonalizationRule } from "@/lib/sites/personalization";
import { resetDb } from "../setup/reset";
import { createOrgWithUser } from "../setup/factories";
import type { ContentElementType, PersonalizationBoundary } from "@/generated/prisma/client";

afterEach(async () => {
  await resetDb();
});

type ElementSpec = {
  elementType: ContentElementType;
  currentContent: string;
  personalizationBoundary?: PersonalizationBoundary;
};

async function seedPage(organizationId: string, elements: ElementSpec[]) {
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
        personalizationBoundary: spec.personalizationBoundary,
      },
    });
  }
  const audience = await prisma.audience.create({ data: { organizationId, name: "Mobile visitors" } });
  return { site, page, audience };
}

// No ANTHROPIC_API_KEY exists in this test environment (same posture as
// generateImage.test.ts's missing OPENAI_API_KEY) — every generation here
// exercises the real heuristic-reselection fallback path, never a mocked
// AI call. The AI-configured coordinated-copy path is verified live
// separately, never mocked, matching this codebase's established
// convention.
describe("generateExperience", () => {
  it("generates heuristic pieces for eligible text elements, skips a type with no site-wide candidate, and excludes NEVER/RESTRICTED", async () => {
    const { organization } = await createOrgWithUser();
    const { page, audience } = await seedPage(organization.id, [
      { elementType: "HEADLINE", currentContent: "Welcome to Acme" },
      { elementType: "HEADLINE", currentContent: "Acme helps teams ship faster" },
      { elementType: "SUBHEADLINE", currentContent: "The fastest way to launch" }, // alone — no candidate
      { elementType: "LOGO", currentContent: "https://example.com/logo.png" }, // NEVER by default
      { elementType: "NAV_LABEL", currentContent: "Pricing" }, // RESTRICTED by default
    ]);

    const experience = await generateExperience(organization.id, page.id, audience.id);

    expect(experience.status).toBe("PENDING");
    expect(experience.audienceId).toBe(audience.id);
    expect(experience.crawledPageId).toBe(page.id);
    // Only the two HEADLINE elements had a real alternative to reselect —
    // the lone SUBHEADLINE, the NEVER-boundary LOGO, and the unacknowledged
    // RESTRICTED NAV_LABEL are all absent from the result.
    expect(experience.rules).toHaveLength(2);
    for (const rule of experience.rules) {
      expect(rule.status).toBe("PENDING");
      expect(rule.method).toBe("HEURISTIC");
    }

    const stored = await prisma.elementPersonalizationRule.findMany({
      where: { generatedExperienceId: experience.id },
    });
    expect(stored).toHaveLength(2);
    expect(stored.every((r) => r.status === "PENDING")).toBe(true);

    // The full page, not just the touched elements — enough for a caller
    // to render a before/after preview from this one DTO.
    expect(experience.pageElements).toHaveLength(5);
    expect(experience.pageElements.some((el) => el.currentContent === "The fastest way to launch")).toBe(true);
  });

  it("includes a RESTRICTED element once acknowledgedRestricted is true, given a real candidate", async () => {
    const { organization } = await createOrgWithUser();
    // suggestFromExistingContent (reused unmodified from suggestVariant.ts)
    // filters out anything under 15 characters for any type outside
    // IMAGE/LOGO/CTA_HREF — a real nav label like "Pricing" is too short to
    // survive that filter, so these use longer text to actually exercise
    // the RESTRICTED-acknowledged path rather than the "no candidate"
    // skip path.
    const { page, audience } = await seedPage(organization.id, [
      { elementType: "HEADLINE", currentContent: "Welcome to Acme" },
      { elementType: "HEADLINE", currentContent: "Acme helps teams ship faster" },
      { elementType: "NAV_LABEL", currentContent: "View Pricing Options" },
      { elementType: "NAV_LABEL", currentContent: "Browse Documentation" },
    ]);

    const withoutAck = await generateExperience(organization.id, page.id, audience.id);
    expect(withoutAck.rules.map((r) => r.content)).not.toContain("View Pricing Options");
    expect(withoutAck.rules.map((r) => r.content)).not.toContain("Browse Documentation");

    const withAck = await generateExperience(organization.id, page.id, audience.id, {
      acknowledgedRestricted: true,
    });
    expect(withAck.rules).toHaveLength(4);
  });

  it("throws NoEligibleElementsError and creates nothing when every element is NEVER or unacknowledged RESTRICTED", async () => {
    const { organization } = await createOrgWithUser();
    const { page, audience } = await seedPage(organization.id, [
      { elementType: "LOGO", currentContent: "https://example.com/logo.png" },
      { elementType: "NAV_LABEL", currentContent: "Pricing" },
    ]);

    await expect(generateExperience(organization.id, page.id, audience.id)).rejects.toThrow(
      NoEligibleElementsError,
    );

    const experiences = await prisma.generatedExperience.findMany({ where: { crawledPageId: page.id } });
    expect(experiences).toEqual([]);
  });

  it("throws NoContentGeneratedError and leaves no orphaned row when nothing usable was produced", async () => {
    const { organization } = await createOrgWithUser();
    // A single HEADLINE with no site-wide alternative — eligible, but the
    // heuristic fallback has nothing real to offer.
    const { page, audience } = await seedPage(organization.id, [
      { elementType: "HEADLINE", currentContent: "Welcome to Acme" },
    ]);

    await expect(generateExperience(organization.id, page.id, audience.id)).rejects.toThrow(
      NoContentGeneratedError,
    );

    const experiences = await prisma.generatedExperience.findMany({ where: { crawledPageId: page.id } });
    expect(experiences).toEqual([]);
  });

  it("throws CrawledPageNotFoundError for a nonexistent or cross-org page", async () => {
    const { organization: orgA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();
    const { page, audience } = await seedPage(orgB.id, [
      { elementType: "HEADLINE", currentContent: "Welcome" },
      { elementType: "HEADLINE", currentContent: "Hello" },
    ]);

    await expect(generateExperience(orgA.id, page.id, audience.id)).rejects.toThrow(CrawledPageNotFoundError);
    await expect(generateExperience(orgA.id, "nonexistent-id", audience.id)).rejects.toThrow(
      CrawledPageNotFoundError,
    );
  });

  it("throws AudienceNotFoundError for a nonexistent or cross-org audience", async () => {
    const { organization: orgA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();
    const { page } = await seedPage(orgA.id, [
      { elementType: "HEADLINE", currentContent: "Welcome" },
      { elementType: "HEADLINE", currentContent: "Hello" },
    ]);
    const { audience: otherOrgAudience } = await seedPage(orgB.id, [
      { elementType: "HEADLINE", currentContent: "Other" },
    ]);

    await expect(generateExperience(orgA.id, page.id, otherOrgAudience.id)).rejects.toThrow(
      AudienceNotFoundError,
    );
  });
});

describe("generated experience review actions", () => {
  async function seedGeneratedExperience(organizationId: string) {
    const { page, audience } = await seedPage(organizationId, [
      { elementType: "HEADLINE", currentContent: "Welcome to Acme" },
      { elementType: "HEADLINE", currentContent: "Acme helps teams ship faster" },
    ]);
    const experience = await generateExperience(organizationId, page.id, audience.id);
    return { page, audience, experience };
  }

  it("getGeneratedExperience is org-scoped", async () => {
    const { organization: orgA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();
    const { experience } = await seedGeneratedExperience(orgA.id);

    const fetched = await getGeneratedExperience(orgA.id, experience.id);
    expect(fetched.id).toBe(experience.id);

    await expect(getGeneratedExperience(orgB.id, experience.id)).rejects.toThrow(GeneratedExperienceNotFoundError);
    await expect(getGeneratedExperience(orgA.id, "nonexistent")).rejects.toThrow(GeneratedExperienceNotFoundError);
  });

  it("approveAllGeneratedExperience approves every PENDING rule and rolls the experience up to APPROVED", async () => {
    const { organization } = await createOrgWithUser();
    const { experience } = await seedGeneratedExperience(organization.id);

    const approved = await approveAllGeneratedExperience(organization.id, experience.id);
    expect(approved.status).toBe("APPROVED");
    expect(approved.rules.every((r) => r.status === "APPROVED")).toBe(true);
  });

  it("approveAllGeneratedExperience leaves an already-disabled rule alone, landing on PARTIALLY_APPROVED", async () => {
    const { organization } = await createOrgWithUser();
    const { experience } = await seedGeneratedExperience(organization.id);

    await disableElementPersonalizationRule(organization.id, experience.rules[0].id);
    const result = await approveAllGeneratedExperience(organization.id, experience.id);

    expect(result.status).toBe("PARTIALLY_APPROVED");
    const disabledRule = result.rules.find((r) => r.id === experience.rules[0].id);
    const otherRule = result.rules.find((r) => r.id === experience.rules[1].id);
    expect(disabledRule?.status).toBe("DISABLED");
    expect(otherRule?.status).toBe("APPROVED");
  });

  it("disabling every rule individually rolls the experience up to REJECTED", async () => {
    const { organization } = await createOrgWithUser();
    const { experience } = await seedGeneratedExperience(organization.id);

    await disableElementPersonalizationRule(organization.id, experience.rules[0].id);
    await disableElementPersonalizationRule(organization.id, experience.rules[1].id);

    const result = await getGeneratedExperience(organization.id, experience.id);
    expect(result.status).toBe("REJECTED");
  });

  it("rejectAllGeneratedExperience deletes the experience, its rules, and their variants", async () => {
    const { organization } = await createOrgWithUser();
    const { experience } = await seedGeneratedExperience(organization.id);
    const variantIds = experience.rules.map((r) => r.elementVariantId);

    await rejectAllGeneratedExperience(organization.id, experience.id);

    expect(await prisma.generatedExperience.findUnique({ where: { id: experience.id } })).toBeNull();
    expect(
      await prisma.elementPersonalizationRule.findMany({ where: { generatedExperienceId: experience.id } }),
    ).toEqual([]);
    expect(await prisma.elementVariant.findMany({ where: { id: { in: variantIds } } })).toEqual([]);
  });

  it("org B cannot approve or reject org A's experience", async () => {
    const { organization: orgA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();
    const { experience } = await seedGeneratedExperience(orgA.id);

    await expect(approveAllGeneratedExperience(orgB.id, experience.id)).rejects.toThrow(
      GeneratedExperienceNotFoundError,
    );
    await expect(rejectAllGeneratedExperience(orgB.id, experience.id)).rejects.toThrow(
      GeneratedExperienceNotFoundError,
    );

    const stillThere = await prisma.generatedExperience.findUnique({ where: { id: experience.id } });
    expect(stillThere).not.toBeNull();
  });
});
