import { readFileSync } from "node:fs";
import path from "node:path";

// Point every test at the test database, never dev — read directly from
// .env rather than relying on load order of other setup code.
const envFile = readFileSync(path.resolve(__dirname, "../../.env"), "utf8");
const match = envFile.match(/^TEST_DATABASE_URL="(.*)"$/m);

if (!match) {
  throw new Error("TEST_DATABASE_URL not found in .env — tests refuse to run against dev data.");
}

process.env.DATABASE_URL = match[1];
// NODE_ENV is already "test" under Vitest and is read-only to assign to.

// Fixed test-only key (not a real secret) — set here, before any module
// imports @/lib/env, since env.ts parses process.env once at import time.
// Ecommerce foundation (docs/ecommerce.md): lets tests exercise real
// encrypt/decrypt round-trips against src/lib/security/encryption.ts
// without needing a real PLATFORM_CREDENTIALS_ENCRYPTION_KEY configured.
if (!process.env.PLATFORM_CREDENTIALS_ENCRYPTION_KEY) {
  process.env.PLATFORM_CREDENTIALS_ENCRYPTION_KEY = "1".repeat(64);
}
