import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { generateImageVariant, NotAnImageElementError } from "@/lib/sites/generateImage";
import {
  PersonalizationBoundaryBlockedError,
  PersonalizationBoundaryNeedsAcknowledgmentError,
} from "@/lib/sites/personalization";
import { ImageGenerationNotConfiguredError } from "@/lib/ai/errors";
import { resetDb } from "../setup/reset";
import { createOrgWithUser } from "../setup/factories";

afterEach(async () => {
  await resetDb();
});

async function seedElement(organizationId: string, elementType: "IMAGE" | "HEADLINE" = "IMAGE") {
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
      selector: elementType === "IMAGE" ? "img.hero" : "h1",
      currentContent: elementType === "IMAGE" ? "https://example.com/hero.jpg" : "Original headline",
      order: 0,
    },
  });
  const audience = await prisma.audience.create({
    data: { organizationId, name: "Mobile visitors" },
  });
  return { site, page, element, audience };
}

// docs/roadmap.md Phase 6: AI image generation. No OPENAI_API_KEY exists
// in this test environment, so the "real provider" round-trip is proven
// live instead (see the roadmap note) — what's meaningfully testable here
// is that generation never even reaches the provider for a request that
// should be rejected earlier, and that "not configured" behaves exactly
// like every other unconfigured integration in this product: no partial
// state, no row created.
describe("generateImageVariant", () => {
  it("throws ImageGenerationNotConfiguredError and creates no rows when OPENAI_API_KEY isn't set", async () => {
    const { organization } = await createOrgWithUser();
    const { element, audience } = await seedElement(organization.id);

    await expect(
      generateImageVariant(organization.id, element.id, { audienceId: audience.id }),
    ).rejects.toThrow(ImageGenerationNotConfiguredError);

    const rules = await prisma.elementPersonalizationRule.findMany({ where: { contentElementId: element.id } });
    expect(rules).toEqual([]);
    const variants = await prisma.elementVariant.findMany({ where: { contentElementId: element.id } });
    expect(variants).toEqual([]);
  });

  it("rejects a non-image element type before ever attempting generation", async () => {
    const { organization } = await createOrgWithUser();
    const { element, audience } = await seedElement(organization.id, "HEADLINE");

    await expect(
      generateImageVariant(organization.id, element.id, { audienceId: audience.id }),
    ).rejects.toThrow(NotAnImageElementError);
  });

  it("accepts a non-LOGO image type, getting past the type check to the configuration check", async () => {
    const { organization } = await createOrgWithUser();
    const { element, audience } = await seedElement(organization.id, "IMAGE");

    await expect(
      generateImageVariant(organization.id, element.id, { audienceId: audience.id }),
    ).rejects.toThrow(ImageGenerationNotConfiguredError);
  });

  // LOGO defaults to the NEVER personalization boundary (product-spec.md
  // §14 — "Logo" is explicitly listed under "Never change"), so it's now
  // blocked before ever reaching the configuration check — a real,
  // intentional behavior change from the type-only check this test
  // covered before boundaries existed.
  it("blocks a LOGO element on its NEVER boundary, before ever reaching the configuration check", async () => {
    const { organization } = await createOrgWithUser();
    const { element, audience } = await seedElement(organization.id, "IMAGE");
    await prisma.contentElement.update({ where: { id: element.id }, data: { elementType: "LOGO" } });

    await expect(
      generateImageVariant(organization.id, element.id, { audienceId: audience.id }),
    ).rejects.toThrow(PersonalizationBoundaryBlockedError);

    const rules = await prisma.elementPersonalizationRule.findMany({ where: { contentElementId: element.id } });
    expect(rules).toEqual([]);
  });

  it("an explicit per-element override past NEVER lets a LOGO element reach the configuration check", async () => {
    const { organization } = await createOrgWithUser();
    const { element, audience } = await seedElement(organization.id, "IMAGE");
    await prisma.contentElement.update({
      where: { id: element.id },
      data: { elementType: "LOGO", personalizationBoundary: "ALLOWED" },
    });

    await expect(
      generateImageVariant(organization.id, element.id, { audienceId: audience.id }),
    ).rejects.toThrow(ImageGenerationNotConfiguredError);
  });

  it("blocks a RESTRICTED element without acknowledgedRestricted", async () => {
    const { organization } = await createOrgWithUser();
    const { element, audience } = await seedElement(organization.id, "IMAGE");
    await prisma.contentElement.update({
      where: { id: element.id },
      data: { personalizationBoundary: "RESTRICTED" },
    });

    await expect(
      generateImageVariant(organization.id, element.id, { audienceId: audience.id }),
    ).rejects.toThrow(PersonalizationBoundaryNeedsAcknowledgmentError);
  });

  it("lets a RESTRICTED element reach the configuration check once acknowledged", async () => {
    const { organization } = await createOrgWithUser();
    const { element, audience } = await seedElement(organization.id, "IMAGE");
    await prisma.contentElement.update({
      where: { id: element.id },
      data: { personalizationBoundary: "RESTRICTED" },
    });

    await expect(
      generateImageVariant(organization.id, element.id, {
        audienceId: audience.id,
        acknowledgedRestricted: true,
      }),
    ).rejects.toThrow(ImageGenerationNotConfiguredError);
  });
});
