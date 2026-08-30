import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { signup } from "@/lib/auth/service";
import { getSessionUserFromToken } from "@/lib/auth/session";
import { EmailInUseError } from "@/lib/auth/errors";
import { resetDb } from "../setup/reset";

afterEach(async () => {
  await resetDb();
});

describe("signup", () => {
  it("creates User, Organization, and an OWNER Membership atomically", async () => {
    const session = await signup({
      email: "founder@example.com",
      password: "a-strong-password",
      organizationName: "Acme Inc",
    });

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "founder@example.com" } });
    const membership = await prisma.membership.findFirst({
      where: { userId: user.id },
      include: { organization: true },
    });

    expect(membership).not.toBeNull();
    expect(membership?.role).toBe("OWNER");
    expect(membership?.organization.name).toBe("Acme Inc");

    // The issued session token actually authenticates as this user.
    const sessionUser = await getSessionUserFromToken(session.token);
    expect(sessionUser?.id).toBe(user.id);
  });

  it("rejects a second signup with the same email", async () => {
    await signup({
      email: "dupe@example.com",
      password: "a-strong-password",
      organizationName: "First Org",
    });

    await expect(
      signup({
        email: "dupe@example.com",
        password: "another-password",
        organizationName: "Second Org",
      }),
    ).rejects.toThrow(EmailInUseError);
  });

  it("gives two organizations with the same requested name distinct slugs", async () => {
    await signup({
      email: "one@example.com",
      password: "a-strong-password",
      organizationName: "Shared Name",
    });
    await signup({
      email: "two@example.com",
      password: "a-strong-password",
      organizationName: "Shared Name",
    });

    const orgs = await prisma.organization.findMany({ where: { name: "Shared Name" } });
    expect(orgs).toHaveLength(2);
    expect(orgs[0].slug).not.toBe(orgs[1].slug);
  });
});
