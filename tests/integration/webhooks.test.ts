import { createHmac } from "node:crypto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  createWebhook,
  listWebhooks,
  deleteWebhook,
  dispatchEvent,
  WebhookNotFoundError,
} from "@/lib/integrations/service";
import { recordSiteEvent } from "@/lib/embed/service";
import { resetDb } from "../setup/reset";
import { createOrgWithUser } from "../setup/factories";

afterEach(async () => {
  await resetDb();
  vi.unstubAllGlobals();
});

// example.com is real and publicly resolvable — same technique
// ssrfGuard.test.ts already uses — so assertSafeExternalUrl's real DNS
// lookup genuinely passes, and only the actual network call is
// intercepted, never this codebase's own logic.
function stubFetch(response: Response | Error = new Response(null, { status: 200 })) {
  const fetchMock =
    response instanceof Error ? vi.fn().mockRejectedValue(response) : vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("createWebhook / listWebhooks / deleteWebhook", () => {
  it("creates a webhook and returns the signing secret once", async () => {
    const { organization } = await createOrgWithUser();
    const webhook = await createWebhook(organization.id, "https://example.com/hooks/dynamify", ["PAGE_VIEW"]);

    expect(webhook).toMatchObject({ url: "https://example.com/hooks/dynamify", eventTypes: ["PAGE_VIEW"], active: true });
    expect(webhook.signingSecret).toHaveLength(64); // 32 bytes, hex-encoded
  });

  it("rejects an unsafe (localhost) URL at creation time", async () => {
    const { organization } = await createOrgWithUser();
    await expect(createWebhook(organization.id, "http://localhost:3000/hook", ["PAGE_VIEW"])).rejects.toThrow(
      "Localhost URLs are not allowed",
    );
  });

  it("lists only the calling organization's webhooks", async () => {
    const { organization: orgA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();
    await createWebhook(orgA.id, "https://example.com/a", ["PAGE_VIEW"]);
    await createWebhook(orgB.id, "https://example.com/b", ["PAGE_VIEW"]);

    const webhooksA = await listWebhooks(orgA.id);
    expect(webhooksA).toHaveLength(1);
    expect(webhooksA[0].url).toBe("https://example.com/a");
  });

  it("deletes a webhook, and 404s deleting another org's", async () => {
    const { organization: orgA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();
    const webhook = await createWebhook(orgA.id, "https://example.com/a", ["PAGE_VIEW"]);

    await expect(deleteWebhook(orgB.id, webhook.id)).rejects.toThrow(WebhookNotFoundError);
    await deleteWebhook(orgA.id, webhook.id);
    expect(await listWebhooks(orgA.id)).toEqual([]);
  });
});

// The actual bug: dispatchEvent (real, signed, SSRF-guarded delivery) was
// only ever called from the retired Page/Event model's dead collection
// path, so a configured webhook could never fire for anything a real
// customer's site did. docs/decisions.md D12.
describe("dispatchEvent", () => {
  it("delivers a correctly signed POST to a matching, active webhook", async () => {
    const { organization } = await createOrgWithUser();
    const webhook = await createWebhook(organization.id, "https://example.com/hooks/dynamify", ["SALE"]);
    const fetchMock = stubFetch();

    const createdAt = new Date("2026-09-08T12:00:00.000Z");
    await dispatchEvent({
      organizationId: organization.id,
      type: "SALE",
      siteId: "site-1",
      crawledPageId: "page-1",
      pageUrl: "https://customer.example.com/checkout/confirmation",
      contentElementId: null,
      value: 49.99,
      currency: "USD",
      createdAt,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://example.com/hooks/dynamify");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");

    const body = init.body as string;
    expect(JSON.parse(body)).toEqual({
      type: "SALE",
      siteId: "site-1",
      crawledPageId: "page-1",
      pageUrl: "https://customer.example.com/checkout/confirmation",
      value: 49.99,
      currency: "USD",
      createdAt: createdAt.toISOString(),
    });

    // The signature must be independently verifiable against the secret
    // the merchant actually received — the whole point of signing.
    const expectedSignature = createHmac("sha256", webhook.signingSecret).update(body).digest("hex");
    expect(init.headers["X-Dynamify-Signature"]).toBe(expectedSignature);
  });

  it("never dispatches to a webhook that isn't subscribed to this event type", async () => {
    const { organization } = await createOrgWithUser();
    await createWebhook(organization.id, "https://example.com/hooks", ["PAGE_VIEW"]);
    const fetchMock = stubFetch();

    await dispatchEvent({
      organizationId: organization.id,
      type: "SALE",
      siteId: "site-1",
      crawledPageId: "page-1",
      pageUrl: "https://customer.example.com/",
      createdAt: new Date(),
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never dispatches to an inactive webhook", async () => {
    const { organization } = await createOrgWithUser();
    const webhook = await createWebhook(organization.id, "https://example.com/hooks", ["PAGE_VIEW"]);
    await prisma.webhookSubscription.update({ where: { id: webhook.id }, data: { active: false } });
    const fetchMock = stubFetch();

    await dispatchEvent({
      organizationId: organization.id,
      type: "PAGE_VIEW",
      siteId: "site-1",
      crawledPageId: "page-1",
      pageUrl: "https://customer.example.com/",
      createdAt: new Date(),
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never dispatches to another organization's webhook, even for the same event type", async () => {
    const { organization: orgA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();
    await createWebhook(orgB.id, "https://example.com/hooks", ["PAGE_VIEW"]);
    const fetchMock = stubFetch();

    await dispatchEvent({
      organizationId: orgA.id,
      type: "PAGE_VIEW",
      siteId: "site-1",
      crawledPageId: "page-1",
      pageUrl: "https://customer.example.com/",
      createdAt: new Date(),
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("delivers independently to every matching webhook", async () => {
    const { organization } = await createOrgWithUser();
    await createWebhook(organization.id, "https://example.com/one", ["LEAD"]);
    await createWebhook(organization.id, "https://example.com/two", ["LEAD"]);
    const fetchMock = stubFetch();

    await dispatchEvent({
      organizationId: organization.id,
      type: "LEAD",
      siteId: "site-1",
      crawledPageId: "page-1",
      pageUrl: "https://customer.example.com/pricing",
      createdAt: new Date(),
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never throws when a subscriber endpoint is unreachable", async () => {
    const { organization } = await createOrgWithUser();
    await createWebhook(organization.id, "https://example.com/broken", ["PAGE_VIEW"]);
    stubFetch(new Error("ECONNREFUSED"));

    await expect(
      dispatchEvent({
        organizationId: organization.id,
        type: "PAGE_VIEW",
        siteId: "site-1",
        crawledPageId: "page-1",
        pageUrl: "https://customer.example.com/",
        createdAt: new Date(),
      }),
    ).resolves.toBeUndefined();
  });
});

// The regression proof: a webhook configured through the real dashboard
// flow now actually fires from the real, live event pipeline —
// recordSiteEvent, not the dead one this bug lived in.
describe("recordSiteEvent triggers real webhook delivery (docs/decisions.md D12)", () => {
  async function seedSite(organizationId: string) {
    const site = await prisma.site.create({
      data: { organizationId, url: "https://example.com", status: "READY" },
    });
    const page = await prisma.crawledPage.create({
      data: { siteId: site.id, organizationId, url: "https://example.com/" },
    });
    const element = await prisma.contentElement.create({
      data: {
        crawledPageId: page.id,
        organizationId,
        section: "HERO",
        elementType: "CTA_LABEL",
        selector: "#cta",
        currentContent: "Buy now",
        order: 0,
      },
    });
    return { site, page, element };
  }

  it("fires for a real PAGE_VIEW", async () => {
    const { organization } = await createOrgWithUser();
    const { site } = await seedSite(organization.id);
    await createWebhook(organization.id, "https://example.com/hooks", ["PAGE_VIEW"]);
    const fetchMock = stubFetch();

    await recordSiteEvent(site.id, "https://example.com", { device: "desktop" });

    // dispatchEvent is deliberately fire-and-forget from recordSiteEvent's
    // perspective (never delays the collection response) — waitFor lets
    // its real, un-awaited DB query + delivery settle before asserting.
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ type: "PAGE_VIEW", siteId: site.id, pageUrl: "https://example.com" });
  });

  it("fires for a real CTA_CLICK with the clicked element's id", async () => {
    const { organization } = await createOrgWithUser();
    const { site, element } = await seedSite(organization.id);
    await createWebhook(organization.id, "https://example.com/hooks", ["CTA_CLICK"]);
    const fetchMock = stubFetch();

    await recordSiteEvent(
      site.id,
      "https://example.com",
      { device: "desktop" },
      undefined,
      { type: "CTA_CLICK", contentElementId: element.id },
    );

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ type: "CTA_CLICK", contentElementId: element.id });
  });

  it("fires for a real SALE with its value and currency", async () => {
    const { organization } = await createOrgWithUser();
    const { site } = await seedSite(organization.id);
    await createWebhook(organization.id, "https://example.com/hooks", ["SALE"]);
    const fetchMock = stubFetch();

    await recordSiteEvent(
      site.id,
      "https://example.com",
      { device: "desktop" },
      undefined,
      { type: "SALE", value: 129, currency: "USD" },
    );

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ type: "SALE", value: 129, currency: "USD" });
  });

  it("never fires for a site that was never crawled at this URL, same as the event itself", async () => {
    const { organization } = await createOrgWithUser();
    await seedSite(organization.id);
    await createWebhook(organization.id, "https://example.com/hooks", ["PAGE_VIEW"]);
    const fetchMock = stubFetch();

    await recordSiteEvent("not-a-real-site", "https://example.com", { device: "desktop" });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
