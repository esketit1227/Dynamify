import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  createElementPersonalization,
  setElementBoundary,
  PersonalizationBoundaryBlockedError,
  PersonalizationBoundaryNeedsAcknowledgmentError,
  ContentElementNotFoundError,
} from "@/lib/sites/personalization";
import { resetDb } from "../setup/reset";
import { createOrgWithUser } from "../setup/factories";

afterEach(async () => {
  await resetDb();
});

async function seedElement(organizationId: string, elementType: "HEADLINE" | "LOGO" = "HEADLINE") {
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
      elementType,
      selector: elementType === "LOGO" ? "img.logo" : "h1",
      currentContent: elementType === "LOGO" ? "https://example.com/logo.png" : "Original headline",
      order: 0,
    },
  });
  const audience = await prisma.audience.create({
    data: { organizationId, name: "Mobile visitors" },
  });
  return { element, audience };
}

// product-spec.md §14: "The user should be able to control what the AI is
// allowed to change." NEVER is a hard block; RESTRICTED requires an
// explicit, server-checked acknowledgment — never inferred from anything
// the client didn't actually confirm.
describe("personalization boundary enforcement", () => {
  it("blocks creating a rule on a NEVER-boundary element (LOGO's default) and creates no rows", async () => {
    const { organization } = await createOrgWithUser();
    const { element, audience } = await seedElement(organization.id, "LOGO");

    await expect(
      createElementPersonalization(organization.id, element.id, {
        audienceId: audience.id,
        method: "MANUAL",
        content: "https://example.com/other-logo.png",
        priority: 0,
      }),
    ).rejects.toThrow(PersonalizationBoundaryBlockedError);

    const rules = await prisma.elementPersonalizationRule.findMany({ where: { contentElementId: element.id } });
    expect(rules).toEqual([]);
  });

  it("blocks creating a rule on a RESTRICTED element without acknowledgedRestricted", async () => {
    const { organization } = await createOrgWithUser();
    const { element, audience } = await seedElement(organization.id, "HEADLINE");
    await setElementBoundary(organization.id, element.id, "RESTRICTED");

    await expect(
      createElementPersonalization(organization.id, element.id, {
        audienceId: audience.id,
        method: "MANUAL",
        content: "Personalized headline",
        priority: 0,
      }),
    ).rejects.toThrow(PersonalizationBoundaryNeedsAcknowledgmentError);
  });

  it("allows creating a rule on a RESTRICTED element once acknowledgedRestricted is true", async () => {
    const { organization } = await createOrgWithUser();
    const { element, audience } = await seedElement(organization.id, "HEADLINE");
    await setElementBoundary(organization.id, element.id, "RESTRICTED");

    const rule = await createElementPersonalization(organization.id, element.id, {
      audienceId: audience.id,
      method: "MANUAL",
      content: "Personalized headline",
      priority: 0,
      acknowledgedRestricted: true,
    });
    expect(rule.status).toBe("PENDING");
  });

  it("an ALLOWED element (HEADLINE's default) needs no acknowledgment", async () => {
    const { organization } = await createOrgWithUser();
    const { element, audience } = await seedElement(organization.id, "HEADLINE");

    const rule = await createElementPersonalization(organization.id, element.id, {
      audienceId: audience.id,
      method: "MANUAL",
      content: "Personalized headline",
      priority: 0,
    });
    expect(rule.status).toBe("PENDING");
  });
});

describe("setElementBoundary", () => {
  it("persists an explicit override and computes the effective boundary from it", async () => {
    const { organization } = await createOrgWithUser();
    const { element } = await seedElement(organization.id, "LOGO");

    const result = await setElementBoundary(organization.id, element.id, "ALLOWED");
    expect(result.boundary).toBe("ALLOWED");
    expect(result.boundaryOverride).toBe("ALLOWED");

    const stored = await prisma.contentElement.findUnique({ where: { id: element.id } });
    expect(stored?.personalizationBoundary).toBe("ALLOWED");
  });

  it("boundary: null resets to the type default, not to a stale override", async () => {
    const { organization } = await createOrgWithUser();
    const { element } = await seedElement(organization.id, "LOGO");

    await setElementBoundary(organization.id, element.id, "ALLOWED");
    const reset = await setElementBoundary(organization.id, element.id, null);
    expect(reset.boundaryOverride).toBeNull();
    expect(reset.boundary).toBe("NEVER"); // LOGO's type default
  });

  it("org A cannot change org B's element boundary", async () => {
    const { organization: orgA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();
    const { element } = await seedElement(orgB.id, "HEADLINE");

    await expect(setElementBoundary(orgA.id, element.id, "NEVER")).rejects.toThrow(ContentElementNotFoundError);

    const stillDefault = await prisma.contentElement.findUnique({ where: { id: element.id } });
    expect(stillDefault?.personalizationBoundary).toBeNull();
  });
});
