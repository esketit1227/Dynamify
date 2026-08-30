import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  createElementPersonalization,
  approveElementPersonalizationRule,
  disableElementPersonalizationRule,
  enableElementPersonalizationRule,
  ElementPersonalizationRuleNotFoundError,
} from "@/lib/sites/personalization";
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

// docs/roadmap.md Phase 3: "nothing goes live unapproved." Every rule
// starts PENDING and must not affect what resolve() sees until explicitly
// approved — this is the load-bearing behavior the whole gate exists for.
describe("personalization approval gating", () => {
  it("a newly created rule is PENDING and does not resolve as personalized", async () => {
    const { organization } = await createOrgWithUser();
    const { page, element, audience } = await seedElement(organization.id);

    const rule = await createElementPersonalization(organization.id, element.id, {
      audienceId: audience.id,
      method: "MANUAL",
      content: "Personalized headline",
      priority: 0,
    });
    expect(rule.status).toBe("PENDING");

    const definition = await getLiveViewDefinition(organization.id, page.id);
    const component = definition.components.find((c) => c.id === element.id);
    expect(component?.personalizationRules).toHaveLength(0);
  });

  it("an approved rule resolves as personalized", async () => {
    const { organization } = await createOrgWithUser();
    const { page, element, audience } = await seedElement(organization.id);

    const rule = await createElementPersonalization(organization.id, element.id, {
      audienceId: audience.id,
      method: "MANUAL",
      content: "Personalized headline",
      priority: 0,
    });
    const approved = await approveElementPersonalizationRule(organization.id, rule.id);
    expect(approved.status).toBe("APPROVED");

    const definition = await getLiveViewDefinition(organization.id, page.id);
    const component = definition.components.find((c) => c.id === element.id);
    expect(component?.personalizationRules).toHaveLength(1);
    expect(component?.personalizationRules[0].id).toBe(rule.id);
  });

  it("org A cannot approve org B's personalization rule", async () => {
    const { organization: orgA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();
    const { element, audience } = await seedElement(orgB.id);

    const rule = await createElementPersonalization(orgB.id, element.id, {
      audienceId: audience.id,
      method: "MANUAL",
      content: "Hijacked headline",
      priority: 0,
    });

    await expect(approveElementPersonalizationRule(orgA.id, rule.id)).rejects.toThrow(
      ElementPersonalizationRuleNotFoundError,
    );

    const stillPending = await prisma.elementPersonalizationRule.findUnique({
      where: { id: rule.id },
    });
    expect(stillPending?.status).toBe("PENDING");
  });

  it("a disabled rule stops resolving but keeps its configuration for re-enabling", async () => {
    const { organization } = await createOrgWithUser();
    const { page, element, audience } = await seedElement(organization.id);

    const rule = await createElementPersonalization(organization.id, element.id, {
      audienceId: audience.id,
      method: "MANUAL",
      content: "Personalized headline",
      priority: 0,
    });
    await approveElementPersonalizationRule(organization.id, rule.id);

    const disabled = await disableElementPersonalizationRule(organization.id, rule.id);
    expect(disabled.status).toBe("DISABLED");
    // Disable isn't delete — the row and its content survive.
    expect(disabled.content).toBe("Personalized headline");

    const definitionWhileDisabled = await getLiveViewDefinition(organization.id, page.id);
    const componentWhileDisabled = definitionWhileDisabled.components.find((c) => c.id === element.id);
    expect(componentWhileDisabled?.personalizationRules).toHaveLength(0);

    const enabled = await enableElementPersonalizationRule(organization.id, rule.id);
    expect(enabled.status).toBe("APPROVED");

    const definitionAfterEnable = await getLiveViewDefinition(organization.id, page.id);
    const componentAfterEnable = definitionAfterEnable.components.find((c) => c.id === element.id);
    expect(componentAfterEnable?.personalizationRules).toHaveLength(1);
  });

  it("records the method a variant was produced by, for review long after creation", async () => {
    const { organization } = await createOrgWithUser();
    const { element, audience } = await seedElement(organization.id);

    const rule = await createElementPersonalization(organization.id, element.id, {
      audienceId: audience.id,
      method: "HEURISTIC",
      content: "Re-selected from another real element on the site",
      priority: 0,
    });
    expect(rule.method).toBe("HEURISTIC");
  });
});
