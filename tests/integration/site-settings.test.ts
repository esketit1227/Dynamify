import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { setIpEnrichmentEnabled, setAutoApproveAiContent } from "@/lib/sites/service";
import { resetDb } from "../setup/reset";
import { createOrgWithUser } from "../setup/factories";

afterEach(async () => {
  await resetDb();
});

// Phase 6 (docs/roadmap.md): off by default, explicit per-site opt-in —
// see docs/decisions.md D5 for why this stays a real toggle, not a default.
describe("setIpEnrichmentEnabled", () => {
  it("is false by default on a newly created site", async () => {
    const { organization } = await createOrgWithUser();
    const site = await prisma.site.create({ data: { organizationId: organization.id, url: "https://example.com" } });
    expect(site.ipEnrichmentEnabled).toBe(false);
  });

  it("turns enrichment on and back off for the owning org", async () => {
    const { organization } = await createOrgWithUser();
    const site = await prisma.site.create({ data: { organizationId: organization.id, url: "https://example.com" } });

    const enabled = await setIpEnrichmentEnabled(organization.id, site.id, true);
    expect(enabled.ipEnrichmentEnabled).toBe(true);

    const disabled = await setIpEnrichmentEnabled(organization.id, site.id, false);
    expect(disabled.ipEnrichmentEnabled).toBe(false);
  });
});

// docs/roadmap.md Hardening: "accept all" -> opt-in AI auto-approval, off
// by default, same explicit-opt-in shape as setIpEnrichmentEnabled above.
describe("setAutoApproveAiContent", () => {
  it("is false by default on a newly created site", async () => {
    const { organization } = await createOrgWithUser();
    const site = await prisma.site.create({ data: { organizationId: organization.id, url: "https://example.com" } });
    expect(site.autoApproveAiContent).toBe(false);
  });

  it("turns auto-approval on and back off for the owning org", async () => {
    const { organization } = await createOrgWithUser();
    const site = await prisma.site.create({ data: { organizationId: organization.id, url: "https://example.com" } });

    const enabled = await setAutoApproveAiContent(organization.id, site.id, true);
    expect(enabled.autoApproveAiContent).toBe(true);

    const disabled = await setAutoApproveAiContent(organization.id, site.id, false);
    expect(disabled.autoApproveAiContent).toBe(false);
  });
});
