import type { SiteVisitor } from "@/generated/prisma/client";

export type ConsentStateDTO = { necessary: boolean; analytics: boolean; personalization: boolean };

function parseConsentState(raw: unknown): ConsentStateDTO {
  const value = raw as Partial<ConsentStateDTO> | null | undefined;
  return {
    necessary: value?.necessary ?? true,
    analytics: value?.analytics ?? false,
    personalization: value?.personalization ?? false,
  };
}

export type SiteVisitorDTO = {
  id: string;
  visitorKey: string;
  // The joined Company's name, falling back to its domain when name is
  // absent — never a bare re-typed string (see the Company model).
  company: string | null;
  interest: string | null;
  intentScore: number;
  stage: string;
  lastDevice: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  pageViewCount: number;
  sessionCount: number;
  converted: boolean;
  consentState: ConsentStateDTO;
  // Whether a Person is actually linked — deliberately not the person's
  // email/name itself. The main table never shows person-level detail;
  // this only drives whether a detail view has anything person-level to
  // show at all (docs/visitor-data.md: "we never deanonymise" is meant
  // to be visible in the product, not just true in the schema).
  hasPerson: boolean;
};

type SiteVisitorWithRelations = SiteVisitor & {
  company: { name: string | null; domain: string | null } | null;
  person: { id: string } | null;
  sessions: { _count: { conversions: number } }[];
};

export function toSiteVisitorDTO(visitor: SiteVisitorWithRelations): SiteVisitorDTO {
  const conversionCount = visitor.sessions.reduce((sum, s) => sum + s._count.conversions, 0);
  return {
    id: visitor.id,
    visitorKey: visitor.visitorKey,
    company: visitor.company?.name ?? visitor.company?.domain ?? null,
    interest: visitor.interest,
    intentScore: visitor.intentScore,
    stage: visitor.stage,
    lastDevice: visitor.lastDevice,
    firstSeenAt: visitor.firstSeenAt.toISOString(),
    lastSeenAt: visitor.lastSeenAt.toISOString(),
    pageViewCount: visitor.pageViewCount,
    sessionCount: visitor.sessions.length,
    converted: conversionCount > 0 || visitor.ctaClickCount > 0,
    consentState: parseConsentState(visitor.consentState),
    hasPerson: visitor.person !== null,
  };
}
