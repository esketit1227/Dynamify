import { test, expect } from "@playwright/test";

function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

test("signup lands on the dashboard, logout returns to login, login works", async ({ page }) => {
  const email = uniqueEmail("e2e");
  const password = "a-strong-password-123";

  await page.goto("/signup");
  await page.getByLabel("Organization name").fill("E2E Test Org");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/overview/);
  await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page).toHaveURL(/\/overview/);
});

test("visiting the dashboard while signed out redirects to login", async ({ page }) => {
  await page.goto("/overview");
  await expect(page).toHaveURL(/\/login/);
});
