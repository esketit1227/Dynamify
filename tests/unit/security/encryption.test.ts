import { describe, it, expect, afterEach } from "vitest";

const ORIGINAL_KEY = process.env.PLATFORM_CREDENTIALS_ENCRYPTION_KEY;

// env.ts parses process.env once at module load, so each test that needs a
// different key state re-imports the module fresh via vi.resetModules()
// rather than mutating the already-parsed `env` export.
async function loadEncryptionWithKey(key: string | undefined) {
  if (key === undefined) delete process.env.PLATFORM_CREDENTIALS_ENCRYPTION_KEY;
  else process.env.PLATFORM_CREDENTIALS_ENCRYPTION_KEY = key;
  const { vi } = await import("vitest");
  vi.resetModules();
  return import("@/lib/security/encryption");
}

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.PLATFORM_CREDENTIALS_ENCRYPTION_KEY;
  else process.env.PLATFORM_CREDENTIALS_ENCRYPTION_KEY = ORIGINAL_KEY;
});

describe("encryptSecret / decryptSecret", () => {
  const KEY = "0".repeat(64); // 32 bytes, hex-encoded

  it("round-trips a plaintext string", async () => {
    const { encryptSecret, decryptSecret } = await loadEncryptionWithKey(KEY);
    const encrypted = encryptSecret("super-secret-api-key");
    expect(decryptSecret(encrypted)).toBe("super-secret-api-key");
  });

  it("produces different ciphertext for the same plaintext each time (random IV)", async () => {
    const { encryptSecret } = await loadEncryptionWithKey(KEY);
    const a = encryptSecret("same plaintext");
    const b = encryptSecret("same plaintext");
    expect(a).not.toBe(b);
  });

  it("throws rather than silently returning garbage when ciphertext is tampered with", async () => {
    const { encryptSecret, decryptSecret } = await loadEncryptionWithKey(KEY);
    const encrypted = encryptSecret("super-secret-api-key");
    const raw = Buffer.from(encrypted, "base64");
    raw[raw.length - 1] ^= 0xff; // flip the last ciphertext byte
    const tampered = raw.toString("base64");
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("throws a clear, typed error when the key isn't configured", async () => {
    const { encryptSecret, EncryptionNotConfiguredError } = await loadEncryptionWithKey(undefined);
    expect(() => encryptSecret("anything")).toThrow(EncryptionNotConfiguredError);
  });
});
