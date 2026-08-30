// Fixed per-type field sets for the form-based editor (CLAUDE.md/roadmap
// scope this as Phase 2's editor — not a drag-and-drop visual builder).
// "Item list" component types (features/testimonials/logos/pricing/FAQ) use
// a single newline-separated text field rather than a dynamic array editor —
// a deliberate simplification, flagged in the session report.

export type ComponentType =
  | "HERO"
  | "TEXT"
  | "IMAGE"
  | "CTA"
  | "FEATURES"
  | "TESTIMONIALS"
  | "LOGOS"
  | "PRICING"
  | "FAQ"
  | "FORM";

export type FieldSpec = {
  key: string;
  label: string;
  kind: "text" | "textarea" | "url";
  placeholder?: string;
  helpText?: string;
};

export const COMPONENT_FIELDS: Record<ComponentType, FieldSpec[]> = {
  HERO: [
    { key: "headline", label: "Headline", kind: "text" },
    { key: "subheadline", label: "Subheadline", kind: "text" },
    { key: "ctaLabel", label: "CTA label", kind: "text" },
    { key: "ctaHref", label: "CTA link", kind: "url" },
  ],
  TEXT: [{ key: "body", label: "Body", kind: "textarea" }],
  IMAGE: [
    { key: "url", label: "Image URL", kind: "url" },
    { key: "alt", label: "Alt text", kind: "text" },
  ],
  CTA: [
    { key: "label", label: "Label", kind: "text" },
    { key: "href", label: "Link", kind: "url" },
  ],
  FEATURES: [
    {
      key: "items",
      label: "Features",
      kind: "textarea",
      placeholder: "Title: description",
      helpText: "One per line, as \"Title: description\"",
    },
  ],
  TESTIMONIALS: [
    {
      key: "items",
      label: "Testimonials",
      kind: "textarea",
      placeholder: "\"Quote\" — Name, Company",
      helpText: "One per line",
    },
  ],
  LOGOS: [
    {
      key: "items",
      label: "Logo image URLs",
      kind: "textarea",
      helpText: "One URL per line",
    },
  ],
  PRICING: [
    {
      key: "items",
      label: "Pricing tiers",
      kind: "textarea",
      placeholder: "Plan: $price - description",
      helpText: "One per line, as \"Plan: $price - description\"",
    },
  ],
  FAQ: [
    {
      key: "items",
      label: "Questions & answers",
      kind: "textarea",
      placeholder: "Question | Answer",
      helpText: "One per line, as \"Question | Answer\"",
    },
  ],
  FORM: [
    {
      key: "fields",
      label: "Form fields",
      kind: "textarea",
      helpText: "One field name per line, e.g. Name / Email / Company",
    },
    { key: "submitLabel", label: "Submit button label", kind: "text" },
  ],
};

export const COMPONENT_TYPE_LABELS: Record<ComponentType, string> = {
  HERO: "Hero",
  TEXT: "Text",
  IMAGE: "Image",
  CTA: "Call to action",
  FEATURES: "Features",
  TESTIMONIALS: "Testimonials",
  LOGOS: "Logos",
  PRICING: "Pricing",
  FAQ: "FAQ",
  FORM: "Form",
};

export function defaultContentFor(type: ComponentType): Record<string, string> {
  const fields = COMPONENT_FIELDS[type];
  return Object.fromEntries(fields.map((f) => [f.key, ""]));
}
