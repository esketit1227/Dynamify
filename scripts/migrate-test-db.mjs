// Applies the committed migrations to TEST_DATABASE_URL (read from .env)
// without touching DATABASE_URL, so `prisma migrate dev` keeps targeting dev.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const envFile = readFileSync(new URL("../.env", import.meta.url), "utf8");
const match = envFile.match(/^TEST_DATABASE_URL="(.*)"$/m);

if (!match) {
  console.error("TEST_DATABASE_URL not found in .env");
  process.exit(1);
}

const result = spawnSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: match[1] },
});

process.exit(result.status ?? 1);
