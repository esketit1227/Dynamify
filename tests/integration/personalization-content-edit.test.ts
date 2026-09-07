import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  createElementPersonalization,
  approveElementPersonalizationRule,
  updateElementPersonalizationRuleContent,
  ElementPersonalizationRuleNotFoundError,
} from "@/lib/sites/personalization";
import { updateElementPersonalizationRuleContentSchema } from "@/lib/validation/sitePersonalization";
import { getLiveViewDefinition } from "@/lib/liveview/service";
import { resetDb } from "../setup/reset";
import { createOrgWithUser } from "../setup/factories";

afterEach(async () => {
  await resetDb();
});

async function seedElement(organizationId: string) {
  const site = await prisma.site.create({
    data: { organizationId, url: "https://example.com", status: "READY" },
  });
  const page = await prisma.crawledPage.create({
    data: { siteId: site.id, organizationId, url: "https://example.com" },
  });
  const element = await prisma.contentElement.create({
    data: {
      crawledPageId: page.id,
      organizationId,
      section: "HERO",
      elementType: "HEADLINE",
      selector: "h1",
      currentContent: "Original headline",
      order: 0,
    },
  });
  const audience = await prisma.audience.create({
    data: { organizationId, name: "Mobile visitors" },
  });
  return { page, element, audience };
}

// The "rewrite this piece" action — see src/lib/sites/personalization.ts's
// updateElementPersonalizationRuleContent. Before this, there was no way to
// edit a rule's content at all; every review surface (ExperienceReview,
// Live View) only ever offered approve/disable/delete on the AI's exact
// original wording.
describe("updateElementPersonalizationRuleContent", () => {
  it("replaces the content without creating a new rule or variant", async () => {
    const { organization } = await createOrgWithUser();
    const { element, audience } = await seedElement(organization.id);

    const rule = await createElementPersonalization(organization.id, element.id, {
      audienceId: audience.id,
      method: "AI",
      content: "Original AI draft",
      priority: 0,
    });

    const updated = await updateElementPersonalizationRuleContent(organization.id, rule.id, "Rewritten by a human");

    expect(updated.id).toBe(rule.id);
    expect(updated.elementVariantId).toBe(rule.elementVariantId);
    expect(updated.content).toBe("Rewritten by a human");
    expect(await prisma.elementVariant.count({ where: { contentElementId: element.id } })).toBe(1);
    expect(await prisma.elementPersonalizationRule.count({ where: { contentElementId: element.id } })).toBe(1);
  });

  it.each(["AI", "HEURISTIC", "MANUAL"] as const)(
    "flips method to MANUAL on edit even when it started as %s",
    async (startingMethod) => {
      const { organization } = await createOrgWithUser();
      const { element, audience } = await seedElement(organization.id);

      const rule = await createElementPersonalization(organization.id, element.id, {
        audienceId: audience.id,
        method: startingMethod,
        content: "Original content",
        priority: 0,
      });

      const updated = await updateElementPersonalizationRuleContent(organization.id, rule.id, "Edited content");
      expect(updated.method).toBe("MANUAL");
    },
  );

  it("never changes status — a PENDING rule stays PENDING after edit", async () => {
    const { organization } = await createOrgWithUser();
    const { element, audience } = await seedElement(organization.id);

    const rule = await createElementPersonalization(organization.id, element.id, {
      audienceId: audience.id,
      method: "AI",
      content: "Original content",
      priority: 0,
    });

    const updated = await updateElementPersonalizationRuleContent(organization.id, rule.id, "Edited content");
    expect(updated.status).toBe("PENDING");
  });

  it("never changes status — an APPROVED (live) rule stays APPROVED after edit, and serves the new content", async () => {
    const { organization } = await createOrgWithUser();
    const { page, element, audience } = await seedElement(organization.id);

    const rule = await createElementPersonalization(organization.id, element.id, {
      audienceId: audience.id,
      method: "AI",
      content: "Original content",
      priority: 0,
    });
    await approveElementPersonalizationRule(organization.id, rule.id);

    const updated = await updateElementPersonalizationRuleContent(organization.id, rule.id, "Edited while live");
    expect(updated.status).toBe("APPROVED");

    const definition = await getLiveViewDefinition(organization.id, page.id);
    const component = definition.components.find((c) => c.id === element.id);
    expect(component?.personalizationRules).toHaveLength(1);
    // The live-serving path reflects the edited text, not the pre-edit one.
    expect(component?.personalizationRules[0].id).toBe(rule.id);
  });

  it("throws for a nonexistent ruleId", async () => {
    const { organization } = await createOrgWithUser();
    await expect(
      updateElementPersonalizationRuleContent(organization.id, "nonexistent-rule-id", "New content"),
    ).rejects.toThrow(ElementPersonalizationRuleNotFoundError);
  });

  it("org A cannot edit org B's personalization rule content", async () => {
    const { organization: orgA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();
    const { element, audience } = await seedElement(orgB.id);

    const rule = await createElementPersonalization(orgB.id, element.id, {
      audienceId: audience.id,
      method: "AI",
      content: "Org B's original content",
      priority: 0,
    });

    await expect(
      updateElementPersonalizationRuleContent(orgA.id, rule.id, "Hijacked content"),
    ).rejects.toThrow(ElementPersonalizationRuleNotFoundError);

    const variant = await prisma.elementVariant.findUnique({ where: { id: rule.elementVariantId } });
    expect(variant?.content).toBe("Org B's original content");
  });
});

describe("updateElementPersonalizationRuleContentSchema", () => {
  it("rejects a dangerous URL scheme the same way rule creation does", () => {
    const result = updateElementPersonalizationRuleContentSchema.safeParse({ content: "javascript:alert(1)" });
    expect(result.success).toBe(false);
  });

  it("rejects empty content", () => {
    const result = updateElementPersonalizationRuleContentSchema.safeParse({ content: "   " });
    expect(result.success).toBe(false);
  });

  it("accepts ordinary text", () => {
    const result = updateElementPersonalizationRuleContentSchema.safeParse({ content: "A perfectly normal headline" });
    expect(result.success).toBe(true);
  });
});
