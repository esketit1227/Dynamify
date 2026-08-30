import { describe, it, expect, afterEach } from "vitest";
import { signup, login, requestPasswordReset, confirmPasswordReset } from "@/lib/auth/service";
import { getSessionUserFromToken } from "@/lib/auth/session";
import { InvalidResetTokenError, InvalidCredentialsError } from "@/lib/auth/errors";
import { resetDb } from "../setup/reset";

afterEach(async () => {
  await resetDb();
});

describe("password reset", () => {
  it("resets the password and invalidates existing sessions", async () => {
    const originalSession = await signup({
      email: "reset@example.com",
      password: "original-password-123",
      organizationName: "Acme Inc",
    });

    const { devToken } = await requestPasswordReset("reset@example.com");
    expect(devToken).toBeTruthy();

    await confirmPasswordReset(devToken!, "brand-new-password-456");

    // The pre-reset session no longer authenticates.
    await expect(getSessionUserFromToken(originalSession.token)).resolves.toBeNull();

    // Old password no longer works; new one does.
    await expect(
      login({ email: "reset@example.com", password: "original-password-123" }),
    ).rejects.toThrow(InvalidCredentialsError);
    await expect(
      login({ email: "reset@example.com", password: "brand-new-password-456" }),
    ).resolves.toBeDefined();
  });

  it("does not reveal whether an email exists", async () => {
    const result = await requestPasswordReset("nobody@example.com");
    expect(result.devToken).toBeUndefined();
  });

  it("rejects a reused token", async () => {
    await signup({
      email: "reuse@example.com",
      password: "original-password-123",
      organizationName: "Acme Inc",
    });
    const { devToken } = await requestPasswordReset("reuse@example.com");

    await confirmPasswordReset(devToken!, "new-password-123");

    await expect(confirmPasswordReset(devToken!, "another-password-456")).rejects.toThrow(
      InvalidResetTokenError,
    );
  });

  it("rejects an unknown token", async () => {
    await expect(confirmPasswordReset("not-a-real-token", "whatever-123")).rejects.toThrow(
      InvalidResetTokenError,
    );
  });
});
