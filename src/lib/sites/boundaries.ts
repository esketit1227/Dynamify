import type { ContentElementType, PersonalizationBoundary } from "@/generated/prisma/client";

// Product-spec.md §14, mapped onto this app's real ContentElementType
// enum. CTA_HREF is included in ALLOWED deliberately — this app already
// ships approval-gated CTA-destination personalization as a working
// Phase 4 feature (docs/roadmap.md); defaulting it to Restricted would
// be a real behavior regression with no stated reason. NAV_LABEL/OTHER
// default to RESTRICTED (spec's "Navigation," and anything the crawler
// couldn't classify with confidence). LOGO is the one type spec calls
// out explicitly under "Never change."
export const DEFAULT_BOUNDARY_BY_TYPE: Record<ContentElementType, PersonalizationBoundary> = {
  HEADLINE: "ALLOWED",
  SUBHEADLINE: "ALLOWED",
  BODY: "ALLOWED",
  CTA_LABEL: "ALLOWED",
  CTA_HREF: "ALLOWED",
  IMAGE: "ALLOWED",
  NAV_LABEL: "RESTRICTED",
  OTHER: "RESTRICTED",
  LOGO: "NEVER",
};

// Pure — a per-element override always wins; otherwise the element's
// type default applies. No I/O, matching the same discipline as the
// personalization engine itself (CLAUDE.md).
export function effectiveBoundary(element: {
  elementType: ContentElementType;
  personalizationBoundary: PersonalizationBoundary | null;
}): PersonalizationBoundary {
  return element.personalizationBoundary ?? DEFAULT_BOUNDARY_BY_TYPE[element.elementType];
}

// Only used to explain a *default* (no explicit per-element override) —
// an override is the merchant's own stated reason, not the system's, so
// the UI shouldn't second-guess it with this copy.
const TYPE_BOUNDARY_REASON: Partial<Record<ContentElementType, string>> = {
  LOGO: "Logos define your brand identity — personalizing them is turned off by default.",
  NAV_LABEL:
    "Navigation labels are easy to get wrong for one audience and confusing for everyone else — personalizing them needs extra care.",
  OTHER: "This element wasn't confidently classified — personalizing it needs extra care.",
};

export function boundaryReason(elementType: ContentElementType): string | null {
  return TYPE_BOUNDARY_REASON[elementType] ?? null;
}

// The auto-approve decision (docs/roadmap.md Hardening), pulled out as its
// own pure function — same "small, named, unit-tested decision" pattern
// as shouldHoldOut (src/lib/experiments/holdout.ts) — rather than left
// inline inside generateImageVariant, which also makes a real network
// call and so can't be exercised end to end without a configured
// provider in this environment. A Restricted element exists specifically
// because it needs a human's judgment, so this is only ever true for
// ALLOWED, regardless of the site setting.
export function shouldAutoApprove(autoApproveEnabled: boolean, boundary: PersonalizationBoundary): boolean {
  return autoApproveEnabled && boundary === "ALLOWED";
}
