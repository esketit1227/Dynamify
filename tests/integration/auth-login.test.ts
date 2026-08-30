import { describe, it, expect, afterEach } from "vitest";
import { signup, login } from "@/lib/auth/service";
import { getSessionUserFromToken } from "@/lib/auth/session";
import { InvalidCredentialsError } from "@/lib/auth/errors";
import { resetDb } from "../setup/reset";

afterEach(async () => {
  await resetDb();
});

describe("login", () => {
  it("succeeds with correct credentials and issues a working session", async () => {
    await signup({
      email: "user@example.com",
      password: "correct-password-123",
      organizationName: "Acme Inc",
    });

    const session = await login({ email: "user@example.com", password: "correct-password-123" });

    const sessionUser = await getSessionUserFromToken(session.token);
    expect(sessionUser?.email).toBe("user@example.com");
  });

  it("rejects a wrong password with a generic error", async () => {
    await signup({
      email: "user@example.com",
      password: "correct-password-123",
      organizationName: "Acme Inc",
    });

    await expect(
      login({ email: "user@example.com", password: "wrong-password" }),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it("rejects an unknown email with the same generic error as a wrong password", async () => {
    const unknownError = await login({
      email: "nobody@example.com",
      password: "whatever-123",
    }).catch((e) => e);
    const wrongPasswordError = await signup({
      email: "known@example.com",
      password: "correct-password-123",
      organizationName: "Acme Inc",
    })
      .then(() => login({ email: "known@example.com", password: "wrong-password" }))
      .catch((e) => e);

    expect(unknownError).toBeInstanceOf(InvalidCredentialsError);
    expect(wrongPasswordError).toBeInstanceOf(InvalidCredentialsError);
    expect(unknownError.message).toBe(wrongPasswordError.message);
    expect(unknownError.status).toBe(wrongPasswordError.status);
  });
});
