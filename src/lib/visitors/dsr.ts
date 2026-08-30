import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/auth/errors";

export class SiteVisitorNotFoundError extends HttpError {
  constructor() {
    super(404, "Visitor not found");
  }
}

// docs/visitor-data.md Security: "Audit-log every export, CRM
// connection, and deletion." A plain write, no I/O failure ever blocks
// the actual DSR action it's logging — an audit-log write failing is not
// a reason to refuse a data subject their rights.
async function logAudit(
  organizationId: string,
  actorUserId: string | null,
  action: string,
  targetId: string,
): Promise<void> {
  await prisma.auditLog
    .create({
      data: { organizationId, actorUserId, action, targetType: "SiteVisitor", targetId },
    })
    .catch(() => {});
}

export type VisitorDetail = {
  visitor: {
    id: string;
    visitorKey: string;
    siteId: string;
    firstSeenAt: string;
    lastSeenAt: string;
    pageViewCount: number;
    ctaClickCount: number;
    stage: string;
    intentScore: number;
    consentState: unknown;
  };
  company: { name: string | null; domain: string | null } | null;
  // docs/visitor-data.md: "Person is nullable and usually null." Only
  // ever non-null when a real form/auth flow linked one — see the
  // Person model's own comment.
  person: { email: string; name: string | null; source: string } | null;
  sessions: {
    id: string;
    startedAt: string;
    lastEventAt: string;
    referrer: string | null;
    device: string | null;
    geoCountry: string | null;
    geoRegion: string | null;
    pageViewCount: number;
    ctaClickCount: number;
    impressions: {
      // Names, not just ids — Impression's own columns are deliberately
      // non-FK (a historical record that must survive its audience/rule
      // being edited or deleted later, see schema.prisma), so these are
      // a best-effort lookup against what currently exists, falling back
      // to a plain label when the source is gone.
      audienceName: string;
      content: string;
      occurredAt: string;
    }[];
    conversions: { occurredAt: string; value: number | null; currency: string | null }[];
  }[];
};

// Shared by the inline detail view (no audit entry — a merchant browsing
// their own dashboard isn't a data-subject-rights export) and
// exportVisitorData below (audit-logged, the real DSR action). Everything
// actually linked to this visitor — no raw IP anywhere in here to begin
// with (never stored, see src/lib/enrichment/ipFirmographics.ts).
export async function getVisitorDetail(organizationId: string, visitorId: string): Promise<VisitorDetail> {
  const visitor = await prisma.siteVisitor.findFirst({
    where: { id: visitorId, organizationId },
    include: {
      company: { select: { name: true, domain: true } },
      person: { select: { email: true, name: true, source: true } },
      sessions: { include: { impressions: true, conversions: true }, orderBy: { startedAt: "desc" } },
    },
  });
  if (!visitor) throw new SiteVisitorNotFoundError();

  const audienceIds = [...new Set(visitor.sessions.flatMap((s) => s.impressions.map((i) => i.audienceId)))];
  const variantIds = [...new Set(visitor.sessions.flatMap((s) => s.impressions.map((i) => i.elementVariantId)))];
  const [audiences, variants] = await Promise.all([
    audienceIds.length
      ? prisma.audience.findMany({ where: { id: { in: audienceIds } }, select: { id: true, name: true } })
      : [],
    variantIds.length
      ? prisma.elementVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true, content: true } })
      : [],
  ]);
  const audienceNameById = new Map(audiences.map((a) => [a.id, a.name]));
  const contentByVariantId = new Map(variants.map((v) => [v.id, v.content]));

  return {
    visitor: {
      id: visitor.id,
      visitorKey: visitor.visitorKey,
      siteId: visitor.siteId,
      firstSeenAt: visitor.firstSeenAt.toISOString(),
      lastSeenAt: visitor.lastSeenAt.toISOString(),
      pageViewCount: visitor.pageViewCount,
      ctaClickCount: visitor.ctaClickCount,
      stage: visitor.stage,
      intentScore: visitor.intentScore,
      consentState: visitor.consentState,
    },
    company: visitor.company,
    person: visitor.person,
    sessions: visitor.sessions.map((s) => ({
      id: s.id,
      startedAt: s.startedAt.toISOString(),
      lastEventAt: s.lastEventAt.toISOString(),
      referrer: s.referrer,
      device: s.device,
      geoCountry: s.geoCountry,
      geoRegion: s.geoRegion,
      pageViewCount: s.pageViewCount,
      ctaClickCount: s.ctaClickCount,
      impressions: s.impressions.map((i) => ({
        audienceName: audienceNameById.get(i.audienceId) ?? "Audience no longer exists",
        content: contentByVariantId.get(i.elementVariantId) ?? "Content no longer exists",
        occurredAt: i.occurredAt.toISOString(),
      })),
      conversions: s.conversions.map((c) => ({
        occurredAt: c.occurredAt.toISOString(),
        value: c.value,
        currency: c.currency,
      })),
    })),
  };
}

// docs/visitor-data.md: "Export: all data for a visitor ID or email,
// machine-readable, within 30 days."
export async function exportVisitorData(
  organizationId: string,
  visitorId: string,
  actorUserId: string,
): Promise<VisitorDetail> {
  const detail = await getVisitorDetail(organizationId, visitorId);
  await logAudit(organizationId, actorUserId, "visitor.export", visitorId);
  return detail;
}

// docs/visitor-data.md: "Delete: hard delete across all tables,
// cascading, including the queue." A single delete on SiteVisitor
// cascades through VisitorSession -> Impression/Conversion and through
// SiteEvent (both onDelete: Cascade in schema.prisma) — one statement,
// not a manual multi-table transaction, because the cascade is already
// the actual guarantee. Company/Person are never deleted here: they're
// shared, deduplicated rows other visitors may still reference, and
// deleting a visitor's *link* to one is exactly what this does.
export async function deleteVisitorData(
  organizationId: string,
  visitorId: string,
  actorUserId: string,
): Promise<void> {
  const visitor = await prisma.siteVisitor.findFirst({ where: { id: visitorId, organizationId } });
  if (!visitor) throw new SiteVisitorNotFoundError();

  await prisma.siteVisitor.delete({ where: { id: visitorId } });
  await logAudit(organizationId, actorUserId, "visitor.delete", visitorId);
}
