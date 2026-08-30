import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/auth/errors";

// Ecommerce foundation (docs/ecommerce.md): the codebase's only reversible
// "store a secret, read it back later" primitive — every other stored
// secret so far (session tokens, password reset tokens, webhook signing
// secrets) is either one-way hashed or, for webhook secrets, plaintext
// because nothing in this app needed real encryption at rest before a
// platform API credential did. AES-256-GCM: authenticated, so a tampered
// or corrupted ciphertext fails loudly (throws) instead of silently
// decrypting to garbage.
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit, the GCM-recommended nonce size
const AUTH_TAG_LENGTH = 16;

export class EncryptionNotConfiguredError extends HttpError {
  constructor() {
    super(
      503,
      "Encryption isn't configured yet — set PLATFORM_CREDENTIALS_ENCRYPTION_KEY to enable it.",
    );
  }
}

function getKey(): Buffer {
  if (!env.PLATFORM_CREDENTIALS_ENCRYPTION_KEY) throw new EncryptionNotConfiguredError();
  const key = Buffer.from(env.PLATFORM_CREDENTIALS_ENCRYPTION_KEY, "hex");
  if (key.length !== 32) {
    throw new HttpError(500, "PLATFORM_CREDENTIALS_ENCRYPTION_KEY must be 32 bytes, hex-encoded.");
  }
  return key;
}

// Output layout: base64(iv || authTag || ciphertext) — one self-contained
// string, so callers can store it in a single text column.
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decryptSecret(encoded: string): string {
  const raw = Buffer.from(encoded, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  // Throws on a tampered/corrupted/wrong-key ciphertext — GCM's
  // authentication check runs inside final().
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
