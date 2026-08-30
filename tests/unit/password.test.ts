import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("password hashing", () => {
  it("hashes and verifies a matching password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    await expect(verifyPassword(hash, "correct-horse-battery-staple")).resolves.toBe(true);
  });

  it("rejects a non-matching password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    await expect(verifyPassword(hash, "wrong-password")).resolves.toBe(false);
  });

  it("rejects against a null hash without throwing", async () => {
    await expect(verifyPassword(null, "anything")).resolves.toBe(false);
  });

  it("produces a different hash each time (salted)", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toBe(b);
  });
});
