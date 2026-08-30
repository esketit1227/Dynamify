import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { getAudience, updateAudience, AudienceNotFoundError } from "@/lib/audiences/service";
import { getPageDetail, updateComponent, ComponentNotFoundError, PageNotFoundError } from "@/lib/pages/service";
import {
  createPersonalization,
  ComponentNotFoundError as PersonalizationComponentNotFoundError,
} from "@/lib/personalization/service";
import { getSite, deleteSite, setIpEnrichmentEnabled, SiteNotFoundError } from "@/lib/sites/service";
import { generateImageVariant } from "@/lib/sites/generateImage";
import {
  ContentElementNotFoundError as ImageElementNotFoundError,
  AudienceNotFoundError as ImageAudienceNotFoundError,
} from "@/lib/sites/personalization";
import { resetDb } from "../setup/reset";
import { createOrgWithUser } from "../setup/factories";

afterEach(async () => {
  await resetDb();
});

// Extends the Phase 0 cross-tenant exit criterion to every Phase 2 resource
// type: a resource lookup scoped to org A's id must never resolve org B's
// row, even when the caller supplies org B's own resource id directly.
describe("cross-tenant isolation — pages/audiences/personalization", () => {
  it("org A cannot read or update org B's audience", async () => {
    const { organization: orgA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();

    const audienceB = await prisma.audience.create({
      data: { organizationId: orgB.id, name: "Org B audience" },
    });

    await expect(getAudience(orgA.id, audienceB.id)).rejects.toThrow(AudienceNotFoundError);
    await expect(
      updateAudience(orgA.id, audienceB.id, { name: "Hijacked", rules: [] }),
    ).rejects.toThrow(AudienceNotFoundError);

    // Untouched.
    const stillThere = await prisma.audience.findUnique({ where: { id: audienceB.id } });
    expect(stillThere?.name).toBe("Org B audience");
  });

  it("org A cannot read org B's page or update org B's component", async () => {
    const { organization: orgA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();

    const projectB = await prisma.project.create({
      data: { organizationId: orgB.id, name: "B Project", slug: "b-project" },
    });
    const pageB = await prisma.page.create({
      data: { organizationId: orgB.id, projectId: projectB.id, name: "Org B Page", slug: "org-b-page" },
    });
    const versionB = await prisma.pageVersion.create({
      data: { organizationId: orgB.id, pageId: pageB.id, versionNumber: 1 },
    });
    const componentB = await prisma.component.create({
      data: {
        organizationId: orgB.id,
        pageVersionId: versionB.id,
        type: "HERO",
        order: 0,
        defaultContent: { headline: "Org B secret headline" },
      },
    });

    await expect(getPageDetail(orgA.id, pageB.id)).rejects.toThrow(PageNotFoundError);
    await expect(
      updateComponent(orgA.id, componentB.id, { defaultContent: { headline: "Hijacked" } }),
    ).rejects.toThrow(ComponentNotFoundError);

    const stillThere = await prisma.component.findUnique({ where: { id: componentB.id } });
    expect((stillThere?.defaultContent as { headline: string }).headline).toBe(
      "Org B secret headline",
    );
  });

  it("org A cannot attach a personalization rule to org B's component, even using org A's own audience", async () => {
    const { organization: orgA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();

    const audienceA = await prisma.audience.create({ data: { organizationId: orgA.id, name: "Org A audience" } });

    const projectB = await prisma.project.create({
      data: { organizationId: orgB.id, name: "B Project", slug: "b-project-2" },
    });
    const pageB = await prisma.page.create({
      data: { organizationId: orgB.id, projectId: projectB.id, name: "Org B Page", slug: "org-b-page-2" },
    });
    const versionB = await prisma.pageVersion.create({
      data: { organizationId: orgB.id, pageId: pageB.id, versionNumber: 1 },
    });
    const componentB = await prisma.component.create({
      data: {
        organizationId: orgB.id,
        pageVersionId: versionB.id,
        type: "HERO",
        order: 0,
        defaultContent: { headline: "Org B headline" },
      },
    });

    await expect(
      createPersonalization(orgA.id, componentB.id, {
        audienceId: audienceA.id,
        content: { headline: "Hijacked" },
        priority: 0,
      }),
    ).rejects.toThrow(PersonalizationComponentNotFoundError);
  });

  it("org A cannot read or delete org B's connected site", async () => {
    const { organization: orgA, user: userA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();

    const siteB = await prisma.site.create({
      data: { organizationId: orgB.id, url: "https://org-b-secret.example.com" },
    });

    await expect(getSite(orgA.id, siteB.id)).rejects.toThrow(SiteNotFoundError);
    await expect(deleteSite(orgA.id, siteB.id, userA.id)).rejects.toThrow(SiteNotFoundError);

    const stillThere = await prisma.site.findUnique({ where: { id: siteB.id } });
    expect(stillThere).not.toBeNull();
  });

  // Phase 6 (docs/roadmap.md): the new per-site opt-in for IP-based
  // enrichment gets the same tenant check as every other site mutation.
  it("org A cannot enable IP enrichment on org B's site", async () => {
    const { organization: orgA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();

    const siteB = await prisma.site.create({
      data: { organizationId: orgB.id, url: "https://org-b-secret.example.com" },
    });

    await expect(setIpEnrichmentEnabled(orgA.id, siteB.id, true)).rejects.toThrow(SiteNotFoundError);

    const stillDisabled = await prisma.site.findUnique({ where: { id: siteB.id } });
    expect(stillDisabled?.ipEnrichmentEnabled).toBe(false);
  });

  // Phase 6 (docs/roadmap.md): AI image generation — org A must not be
  // able to generate against org B's element, nor use org A's own element
  // with org B's audienceId to smuggle a rule onto a foreign resource.
  it("org A cannot generate an image against org B's element or using org B's audience", async () => {
    const { organization: orgA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();

    const siteA = await prisma.site.create({ data: { organizationId: orgA.id, url: "https://a.example.com", status: "READY" } });
    const pageA = await prisma.crawledPage.create({ data: { siteId: siteA.id, organizationId: orgA.id, url: "https://a.example.com" } });
    const elementA = await prisma.contentElement.create({
      data: { crawledPageId: pageA.id, organizationId: orgA.id, section: "HERO", elementType: "IMAGE", selector: "img", currentContent: "https://a.example.com/hero.jpg", order: 0 },
    });
    const audienceA = await prisma.audience.create({ data: { organizationId: orgA.id, name: "Org A audience" } });

    const siteB = await prisma.site.create({ data: { organizationId: orgB.id, url: "https://b.example.com", status: "READY" } });
    const pageB = await prisma.crawledPage.create({ data: { siteId: siteB.id, organizationId: orgB.id, url: "https://b.example.com" } });
    const elementB = await prisma.contentElement.create({
      data: { crawledPageId: pageB.id, organizationId: orgB.id, section: "HERO", elementType: "IMAGE", selector: "img", currentContent: "https://b.example.com/hero.jpg", order: 0 },
    });
    const audienceB = await prisma.audience.create({ data: { organizationId: orgB.id, name: "Org B audience" } });

    await expect(
      generateImageVariant(orgA.id, elementB.id, { audienceId: audienceA.id }),
    ).rejects.toThrow(ImageElementNotFoundError);

    await expect(
      generateImageVariant(orgA.id, elementA.id, { audienceId: audienceB.id }),
    ).rejects.toThrow(ImageAudienceNotFoundError);

    const rules = await prisma.elementPersonalizationRule.findMany({
      where: { contentElementId: { in: [elementA.id, elementB.id] } },
    });
    expect(rules).toEqual([]);
  });
});
