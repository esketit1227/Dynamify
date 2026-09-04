// Human labels for internal enum values that would otherwise leak straight
// into the UI (docs/launch-plan.md §3 — e.g. "HEADLINE", "CTA_LABEL"
// rendering verbatim). Pure lookups, no I/O — safe in server or client
// components. Falls back to a title-cased version of the raw value for any
// enum member added here without updating the map, rather than crashing or
// rendering blank.
const ELEMENT_TYPE_LABELS: Record<string, string> = {
  HEADLINE: "Headline",
  SUBHEADLINE: "Subheadline",
  BODY: "Body text",
  IMAGE: "Image",
  CTA_LABEL: "Button text",
  CTA_HREF: "Button link",
  LOGO: "Logo",
  NAV_LABEL: "Navigation label",
  OTHER: "Other",
};

const SECTION_LABELS: Record<string, string> = {
  HERO: "Hero",
  FEATURES: "Features",
  TESTIMONIALS: "Testimonials",
  CTA: "Call to action",
  NAV: "Navigation",
  FOOTER: "Footer",
  PRICING: "Pricing",
  FAQ: "FAQ",
  OTHER: "Other",
};

function titleCaseFallback(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function elementTypeLabel(elementType: string): string {
  return ELEMENT_TYPE_LABELS[elementType] ?? titleCaseFallback(elementType);
}

export function sectionLabel(section: string): string {
  return SECTION_LABELS[section] ?? titleCaseFallback(section);
}
