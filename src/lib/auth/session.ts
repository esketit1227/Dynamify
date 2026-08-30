import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type IssuedSession = { token: string; expiresAt: Date };

// Pure DB write — no cookie access, so this is unit-testable outside a
// request context. Route handlers call this, then setSessionCookie().
export async function issueSession(userId: string): Promise<IssuedSession> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await prisma.session.create({ data: { userId, tokenHash, expiresAt } });

  return { token, expiresAt };
}

export async function setSessionCookie({ token, expiresAt }: IssuedSession): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(env.SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
};

// Pure DB lookup — unit-testable without a request context.
export async function getSessionUserFromToken(
  token: string | undefined,
): Promise<SessionUser | null> {
  if (!token) return null;

  const tokenHash = hashToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  };
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(env.SESSION_COOKIE_NAME)?.value;
  return getSessionUserFromToken(token);
}

export async function destroySessionByToken(token: string | undefined): Promise<void> {
  if (!token) return;
  const tokenHash = hashToken(token);
  await prisma.session.deleteMany({ where: { tokenHash } });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(env.SESSION_COOKIE_NAME);
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(env.SESSION_COOKIE_NAME)?.value;
  await destroySessionByToken(token);
  cookieStore.delete(env.SESSION_COOKIE_NAME);
}

// Invalidates every session for a user — used after a password reset so a
// leaked/stolen session can't survive the reset.
export async function destroyAllSessionsForUser(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}
