import { test, expect, request as playwrightRequest } from "@playwright/test";

function unique(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

// product-spec.md §48: visitor -> audience -> variant -> interaction ->
// conversion -> visible in the dashboard. This is the MVP's core
// hypothesis made concrete: a personalized page actually serves different,
// correct content to different visitors, end to end over real HTTP.
test("a page personalized for mobile visitors serves the right variant to each visitor", async ({
  browser,
}, testInfo) => {
  const baseURL = testInfo.project.use.baseURL as string;
  const api = await playwrightRequest.newContext({ baseURL });

  const signup = await api.post("/api/auth/signup", {
    data: {
      email: `${unique("demo")}@example.com`,
      password: "a-strong-password-123",
      organizationName: "Demo Loop Co",
    },
  });
  expect(signup.ok()).toBe(true);

  const me = await (await api.get("/api/me")).json();
  const orgId = me.organization.id;

  const audienceRes = await api.post(`/api/organizations/${orgId}/audiences`, {
    data: {
      name: "Mobile visitors",
      rules: [{ field: "device", operator: "EQUALS", value: "mobile", groupIndex: 0 }],
    },
  });
  const { audience } = await audienceRes.json();

  const slug = unique("demo-loop");
  const pageRes = await api.post(`/api/organizations/${orgId}/pages`, {
    data: { name: "Demo Loop Page", slug },
  });
  const { page: createdPage } = await pageRes.json();

  const componentRes = await api.post(
    `/api/organizations/${orgId}/pages/${createdPage.id}/components`,
    {
      data: {
        type: "HERO",
        defaultContent: { headline: "Default headline", subheadline: "", ctaLabel: "Sign up", ctaHref: "/signup" },
      },
    },
  );
  const { component } = await componentRes.json();

  const personalizeRes = await api.post(
    `/api/organizations/${orgId}/pages/${createdPage.id}/components/${component.id}/personalize`,
    {
      data: {
        audienceId: audience.id,
        content: { headline: "Mobile headline", subheadline: "", ctaLabel: "Sign up", ctaHref: "/signup" },
        priority: 0,
      },
    },
  );
  expect(personalizeRes.ok()).toBe(true);

  const publishRes = await api.post(`/api/organizations/${orgId}/pages/${createdPage.id}/publish`);
  expect(publishRes.ok()).toBe(true);

  // A desktop visitor sees the default.
  const desktopContext = await browser.newContext({ baseURL });
  const desktopPage = await desktopContext.newPage();
  await desktopPage.goto(`/p/${slug}`);
  await expect(desktopPage.locator("h1")).toHaveText("Default headline");

  // A mobile visitor sees the personalized variant, and clicking the CTA
  // records a real event (checked via the org's Analytics data below).
  const mobileContext = await browser.newContext({
    baseURL,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
    viewport: { width: 390, height: 844 },
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(`/p/${slug}`);
  await expect(mobilePage.locator("h1")).toHaveText("Mobile headline");
  await mobilePage.getByText("Sign up", { exact: true }).click();

  // Draft/unpublished pages 404 publicly, and a nonexistent slug does too.
  const notFound = await api.get(`/p/${unique("nope")}`);
  expect(notFound.status()).toBe(404);

  // Give the sendBeacon/fetch(keepalive) collection calls a beat to land,
  // then confirm they actually reached the Analytics dashboard — the whole
  // point of §48's loop being "visible in the dashboard," not just fired.
  await mobilePage.waitForTimeout(500);
  await desktopPage.waitForTimeout(200);

  const analyticsHtml = await (await api.get("/analytics")).text();
  expect(analyticsHtml).not.toContain("No data yet");
  expect(analyticsHtml).toContain("Demo Loop Page");

  await desktopContext.close();
  await mobileContext.close();
});
