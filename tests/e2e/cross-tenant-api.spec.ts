import { test, expect, request as playwrightRequest } from "@playwright/test";

function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

// The Phase 0 exit criterion, exercised over real HTTP against the real
// running server: a second user's session cannot read the first user's org
// data through the API — not even to learn it exists.
test("org A's session gets 404, not org B's data, from the pages API", async ({}, testInfo) => {
  const baseURL = testInfo.project.use.baseURL as string;

  const contextA = await playwrightRequest.newContext({ baseURL });
  const contextB = await playwrightRequest.newContext({ baseURL });

  const signupA = await contextA.post("/api/auth/signup", {
    data: {
      email: uniqueEmail("tenant-a"),
      password: "a-strong-password-123",
      organizationName: "Tenant A Inc",
    },
  });
  expect(signupA.ok()).toBe(true);

  const signupB = await contextB.post("/api/auth/signup", {
    data: {
      email: uniqueEmail("tenant-b"),
      password: "another-strong-password-456",
      organizationName: "Tenant B Inc",
    },
  });
  expect(signupB.ok()).toBe(true);

  const meB = await (await contextB.get("/api/me")).json();
  const orgBId = meB.organization.id as string;

  // Org B can read its own (empty) page list.
  const orgBOwnPages = await contextB.get(`/api/organizations/${orgBId}/pages`);
  expect(orgBOwnPages.ok()).toBe(true);

  // Org A's session hits org B's pages endpoint directly.
  const crossTenantAttempt = await contextA.get(`/api/organizations/${orgBId}/pages`);
  expect(crossTenantAttempt.status()).toBe(404);
  const body = await crossTenantAttempt.json();
  expect(JSON.stringify(body)).not.toContain("Tenant B");

  // A nonexistent org id gets the identical response — no oracle for
  // "does this org exist" vs. "you're not in it".
  const nonexistentAttempt = await contextA.get("/api/organizations/does-not-exist/pages");
  expect(nonexistentAttempt.status()).toBe(crossTenantAttempt.status());
  expect(await nonexistentAttempt.json()).toEqual(body);

  await contextA.dispose();
  await contextB.dispose();
});

test("unauthenticated request to the pages API is rejected, not just the dashboard page", async ({}, testInfo) => {
  const baseURL = testInfo.project.use.baseURL as string;
  const anon = await playwrightRequest.newContext({ baseURL });

  const res = await anon.get("/api/organizations/anything/pages");
  expect(res.status()).toBe(401);

  await anon.dispose();
});
