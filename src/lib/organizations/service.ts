import { prisma } from "@/lib/db";

export type RetentionWindows = {
  rawEventRetentionDays: number;
  sessionRetentionDays: number;
  visitorRetentionDays: number;
};

// docs/visitor-data.md Retention: "Make retention windows configurable
// per organisation, with our defaults as the maximum, not the minimum."
// Enforced by maybeCleanupOrgVisitorData (src/lib/visitors/service.ts),
// read fresh on every embed request — no cache to invalidate here.
export async function setRetentionWindows(
  organizationId: string,
  windows: RetentionWindows,
): Promise<RetentionWindows> {
  const updated = await prisma.organization.update({
    where: { id: organizationId },
    data: windows,
  });
  return {
    rawEventRetentionDays: updated.rawEventRetentionDays,
    sessionRetentionDays: updated.sessionRetentionDays,
    visitorRetentionDays: updated.visitorRetentionDays,
  };
}
