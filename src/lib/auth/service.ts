import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { issueSession, destroyAllSessionsForUser, type IssuedSession } from "@/lib/auth/session";
import { slugify, slugWithSuffix } from "@/lib/slug";
import {
  EmailInUseError,
  InvalidCredentialsError,
  InvalidResetTokenError,
} from "@/lib/auth/errors";
import type { SignupInput, LoginInput } from "@/lib/validation/auth";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function signup(input: SignupInput): Promise<IssuedSession> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new EmailInUseError();
  }

  const passwordHash = await hashPassword(input.password);
  const baseSlug = slugify(input.organizationName);

  const userId = await prisma.$transaction(async (tx) => {
    let slug = baseSlug;
    if (await tx.organization.findUnique({ where: { slug } })) {
      slug = slugWithSuffix(baseSlug);
    }

    const organization = await tx.organization.create({
      data: { name: input.organizationName, slug },
    });

    const user = await tx.user.create({
      data: { email: input.email, passwordHash, name: input.name },
    });

    await tx.membership.create({
      data: { userId: user.id, organizationId: organization.id, role: "OWNER" },
    });

    return user.id;
  });

  return issueSession(userId);
}

export async function login(input: LoginInput): Promise<IssuedSession> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  // Always runs argon2.verify, even without a user, so timing and the error
  // response are identical for "no such user" and "wrong password".
  const valid = await verifyPassword(user?.passwordHash ?? null, input.password);
  if (!user || !valid) {
    throw new InvalidCredentialsError();
  }

  return issueSession(user.id);
}

const RESET_TOKEN_DURATION_MS = 60 * 60 * 1000; // 1 hour

export async function requestPasswordReset(email: string): Promise<{ devToken?: string }> {
  const user = await prisma.user.findUnique({ where: { email } });
  // No early return skips anything user-visible — the route always responds
  // 200 regardless, so there's nothing to branch on here.
  if (!user) return {};

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_DURATION_MS);

  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt },
  });

  // No email provider yet (Integrations is a later phase), so there is no
  // real send path. CLAUDE.md forbids logging tokens, so this never goes to
  // console in dev or prod — the token is returned only under NODE_ENV=test,
  // as a narrow, explicit hook so the full reset lifecycle is testable
  // without duplicating the hashing logic in test code.
  if (env.NODE_ENV === "test") {
    return { devToken: token };
  }
  return {};
}

export async function confirmPasswordReset(token: string, newPassword: string): Promise<void> {
  const tokenHash = hashToken(token);
  const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

  if (
    !resetToken ||
    resetToken.usedAt ||
    resetToken.expiresAt < new Date()
  ) {
    throw new InvalidResetTokenError();
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    }),
  ]);

  await destroyAllSessionsForUser(resetToken.userId);
}
