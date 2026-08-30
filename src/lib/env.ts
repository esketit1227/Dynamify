import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  TEST_DATABASE_URL: z.string().min(1).optional(),
  SESSION_COOKIE_NAME: z.string().min(1).default("dynamify_session"),
  // Optional: enables subdomain-based public page routing in middleware.ts
  // ({slug}.BASE_DOMAIN -> /p/{slug}). Unset in this dev environment — there's
  // no real domain to test subdomains against, so /p/[slug] is always
  // reachable directly regardless.
  BASE_DOMAIN: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  IPINFO_API_KEY: z.string().min(1).optional(),
  // Overridable so live verification can point this at a local mock
  // server instead of the real paid API — see
  // src/lib/enrichment/ipFirmographics.ts for why this call deliberately
  // doesn't go through the SSRF guard (which would block localhost).
  IPINFO_BASE_URL: z.string().min(1).default("https://ipinfo.io"),
  OPENAI_API_KEY: z.string().min(1).optional(),
  // Overridable for the same reason as IPINFO_BASE_URL — live verification
  // against a local mock, no real key in this environment. See
  // src/lib/sites/generateImage.ts.
  OPENAI_IMAGE_BASE_URL: z.string().min(1).default("https://api.openai.com/v1"),
  // Ecommerce foundation (docs/ecommerce.md): a 32-byte key, hex-encoded
  // (`openssl rand -hex 32`), for AES-256-GCM encryption of stored platform
  // credentials (src/lib/security/encryption.ts). Optional because nothing
  // in this dev environment has a real credential to store yet — set
  // before connecting any real platform.
  PLATFORM_CREDENTIALS_ENCRYPTION_KEY: z.string().min(1).optional(),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export const env = envSchema.parse(process.env);
