import { getSessionUser, type SessionUser } from "@/lib/auth/session";
import { UnauthenticatedError } from "@/lib/auth/errors";

export async function requireSession(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new UnauthenticatedError();
  }
  return user;
}
