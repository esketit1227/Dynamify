import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  TEST_DATABASE_URL: z.string().min(1).optional(),
  SESSION_COOKIE_NAME: z.string().min(1).default("dynamify_session"),
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
  // Transactional email (password reset today — see src/lib/email/). Unset
  // means sendEmail() throws EmailNotConfiguredError and every caller
  // degrades to "no email sent" without surfacing that to the end user
  // (same posture as every other optional integration in this app).
  // Setting this key is the entire activation step; nothing else changes.
  RESEND_API_KEY: z.string().min(1).optional(),
  // Overridable for the same reason as IPINFO_BASE_URL/OPENAI_IMAGE_BASE_URL
  // — live verification against a local mock, no real key in this
  // environment. See src/lib/email/client.ts.
  RESEND_BASE_URL: z.string().min(1).default("https://api.resend.com"),
  // Resend's own sandbox sender — real deliverability without a verified
  // domain, meant to be overridden once one exists. Keeps "set one API key"
  // literally true: no domain/DNS setup required to get real email flowing.
  EMAIL_FROM_ADDRESS: z.string().min(1).default("Dynamify <onboarding@resend.dev>"),
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
