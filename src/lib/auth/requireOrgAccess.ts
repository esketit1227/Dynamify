import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/requireSession";
import { OrgAccessError } from "@/lib/auth/errors";
import type { SessionUser } from "@/lib/auth/session";
import type { Role } from "@/generated/prisma/enums";

export type OrgContext = {
  user: SessionUser;
  organization: { id: string; name: string; slug: string };
  membership: { role: Role };
};

/**
 * Pure membership check — no session/cookie access, so it's unit-testable
 * directly with a userId + organizationId. Throws 404, not 403, when the
 * caller isn't a member: a non-member can't distinguish "not your org" from
 * "org doesn't exist", which avoids leaking which organizations exist to
 * people who aren't in them.
 */
export async function checkOrgMembership(
  userId: string,
  organizationId: string,
): Promise<{ organization: { id: string; name: string; slug: string }; role: Role }> {
  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
    include: { organization: true },
  });

  if (!membership) {
    throw new OrgAccessError();
  }

  return {
    organization: {
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug,
    },
    role: membership.role,
  };
}

/**
 * Resolves the session, then verifies the caller is a member of `organizationId`.
 * Every tenant-scoped route handler must call this before touching any
 * org-scoped data — never trust an organizationId from client input alone.
 */
export async function requireOrgAccess(organizationId: string): Promise<OrgContext> {
  const user = await requireSession();
  const { organization, role } = await checkOrgMembership(user.id, organizationId);
  return { user, organization, membership: { role } };
}
