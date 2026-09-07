import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createAudienceProposalFromSiteUnderstanding, getPendingAudienceProposal } from "@/lib/ai/proposals";
import { AiNotConfiguredError } from "@/lib/ai/errors";
import { resetDb } from "../setup/reset";
import { createOrgWithUser } from "../setup/factories";

afterEach(async () => {
  await resetDb();
});

async function seedSiteWithUnderstanding(organizationId: string) {
  const site = await prisma.site.create({
    data: { organizationId, url: "https://example.com", status: "READY" },
  });
  await prisma.websiteUnderstanding.create({
    data: {
      siteId: site.id,
      organizationId,
      companySummary: "Acme sells project management software.",
      productSummary: "A Kanban-based tool for creative agencies.",
      targetCustomers: "Small creative agencies with 5-50 employees.",
      brandTone: { tone: ["direct"], vocabulary: [], formality: "casual" },
      valueProps: ["Faster client approvals"],
      method: "AI",
    },
  });
  return site;
}

// No ANTHROPIC_API_KEY exists in this test environment (same posture as
// generateExperience.test.ts) — createAudienceProposalFromSiteUnderstanding
// always reaches the real generateAudiences() call and fails with
// AiNotConfiguredError here. What's genuinely testable without a real key is
// everything around that call: finding (or failing to find) the right
// WebsiteUnderstanding, and that a failed AI call never leaves a partial
// AiProposal row behind. The AI-configured success path is verified live
// separately, never mocked, matching this codebase's established convention.
describe("createAudienceProposalFromSiteUnderstanding", () => {
  it("throws when the site has no WebsiteUnderstanding yet", async () => {
    const { organization } = await createOrgWithUser();
    const site = await prisma.site.create({
      data: { organizationId: organization.id, url: "https://example.com", status: "READY" },
    });

    await expect(
      createAudienceProposalFromSiteUnderstanding(organization.id, site.id),
    ).rejects.toThrow("No website understanding found for this site.");
  });

  it("scopes the WebsiteUnderstanding lookup to the given organization", async () => {
    const { organization: orgA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();
    const site = await seedSiteWithUnderstanding(orgA.id);

    // orgB asking about orgA's site must not find orgA's understanding.
    await expect(
      createAudienceProposalFromSiteUnderstanding(orgB.id, site.id),
    ).rejects.toThrow("No website understanding found for this site.");
  });

  it("propagates the real AI failure without creating a partial proposal", async () => {
    const { organization } = await createOrgWithUser();
    const site = await seedSiteWithUnderstanding(organization.id);

    await expect(
      createAudienceProposalFromSiteUnderstanding(organization.id, site.id),
    ).rejects.toThrow(AiNotConfiguredError);

    const proposals = await prisma.aiProposal.findMany({ where: { organizationId: organization.id } });
    expect(proposals).toEqual([]);
  });
});

describe("getPendingAudienceProposal", () => {
  it("returns null when there is no proposal at all", async () => {
    const { organization } = await createOrgWithUser();
    expect(await getPendingAudienceProposal(organization.id)).toBeNull();
  });

  it("returns a pending AUDIENCE proposal", async () => {
    const { organization } = await createOrgWithUser();
    const proposal = await prisma.aiProposal.create({
      data: {
        organizationId: organization.id,
        kind: "AUDIENCE",
        input: { source: "site-crawl", siteId: "site_1" },
        proposedContent: { audiences: [{ name: "Mobile visitors", description: "", rules: [] }] },
      },
    });

    const result = await getPendingAudienceProposal(organization.id);
    expect(result?.id).toBe(proposal.id);
  });

  it("ignores proposals that are already reviewed", async () => {
    const { organization } = await createOrgWithUser();
    await prisma.aiProposal.create({
      data: {
        organizationId: organization.id,
        kind: "AUDIENCE",
        status: "APPROVED",
        input: {},
        proposedContent: { audiences: [] },
      },
    });

    expect(await getPendingAudienceProposal(organization.id)).toBeNull();
  });

  it("ignores proposals of a different kind", async () => {
    const { organization } = await createOrgWithUser();
    await prisma.aiProposal.create({
      data: {
        organizationId: organization.id,
        kind: "COPY",
        input: {},
        proposedContent: {},
      },
    });

    expect(await getPendingAudienceProposal(organization.id)).toBeNull();
  });

  it("never returns another organization's proposal", async () => {
    const { organization: orgA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();
    await prisma.aiProposal.create({
      data: {
        organizationId: orgA.id,
        kind: "AUDIENCE",
        input: {},
        proposedContent: { audiences: [] },
      },
    });

    expect(await getPendingAudienceProposal(orgB.id)).toBeNull();
  });
});
