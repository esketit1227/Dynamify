import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// e2e runs against the test database, never dev — same source of truth as
// tests/setup/env.ts for Vitest.
const envFile = readFileSync(path.resolve(__dirname, ".env"), "utf8");
const testDbMatch = envFile.match(/^TEST_DATABASE_URL="(.*)"$/m);
if (!testDbMatch) {
  throw new Error("TEST_DATABASE_URL not found in .env");
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
  },
  webServer: {
    command: "pnpm build && pnpm start",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { PORT: "3100", DATABASE_URL: testDbMatch[1] },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
