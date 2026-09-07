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

// docs/launch-plan.md §5C ("Auto-draft") — off by default, same explicit
// opt-in shape as every other toggle in this app. Read by the daily cron
// (src/app/api/cron/auto-optimize/route.ts) to decide which orgs to run
// automatic recommendation-detection + draft-generation for. Turning this
// on never bypasses approval — it only automates the "find an opportunity
// and draft copy for it" steps that were previously manual clicks.
export async function setAutoOptimizeEnabled(organizationId: string, enabled: boolean): Promise<boolean> {
  const updated = await prisma.organization.update({
    where: { id: organizationId },
    data: { autoOptimizeEnabled: enabled },
  });
  return updated.autoOptimizeEnabled;
}
