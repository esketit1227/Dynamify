import { prisma } from "@/lib/db";
import type { Role } from "@/generated/prisma/enums";

export type CurrentOrg = {
  id: string;
  name: string;
  slug: string;
  role: Role;
  rawEventRetentionDays: number;
  sessionRetentionDays: number;
  visitorRetentionDays: number;
};

// Phase 0 scope: a user has exactly one organization (created at signup;
// invite flow is deferred per docs/roadmap.md), so "current org" is just
// their earliest membership. Membership already supports many-to-many, so an
// org switcher is additive later, not a migration.
export async function getCurrentOrgForUser(userId: string): Promise<CurrentOrg | null> {
  const membership = await prisma.membership.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: { organization: true },
  });

  if (!membership) return null;

  return {
    id: membership.organization.id,
    name: membership.organization.name,
    slug: membership.organization.slug,
    role: membership.role,
    rawEventRetentionDays: membership.organization.rawEventRetentionDays,
    sessionRetentionDays: membership.organization.sessionRetentionDays,
    visitorRetentionDays: membership.organization.visitorRetentionDays,
  };
}
