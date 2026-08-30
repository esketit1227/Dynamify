import { z } from "zod";

const componentTypes = [
  "HERO",
  "TEXT",
  "IMAGE",
  "CTA",
  "FEATURES",
  "TESTIMONIALS",
  "LOGOS",
  "PRICING",
  "FAQ",
  "FORM",
] as const;

// Public-namespace slug (Page.slug is global — see schema comment): lowercase
// letters, digits, hyphens only, so it's safe to use as a subdomain label.
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Slug must be at least 3 characters")
  .max(63, "Slug must be at most 63 characters")
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens only");

export const createPageSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: slugSchema,
});
export type CreatePageInput = z.infer<typeof createPageSchema>;

// Blocks script-executing URL schemes in any content string — several
// component types (HERO/CTA) put this text directly into an href a visitor
// clicks, so a malicious/compromised value here would be stored XSS against
// that org's own visitors otherwise. Applied to every string field, not just
// the "url"-kind ones, since content is free text and any field could end
// up used as a link.
export const DANGEROUS_URL_SCHEME = /^\s*(javascript|data|vbscript):/i;
export const safeContentString = z
  .string()
  .max(2000)
  .refine((value) => !DANGEROUS_URL_SCHEME.test(value), "That value isn't allowed here");

// Content is a small, bounded JSON object of string/number/boolean leaves —
// enough for the fixed per-type field sets the form-based editor uses,
// without accepting arbitrary nested structures at the trust boundary.
const contentValue = z.union([safeContentString, z.number(), z.boolean()]);
export const contentSchema = z.record(z.string().max(50), contentValue).refine(
  (obj) => Object.keys(obj).length <= 30,
  "Too many fields",
);

export const addComponentSchema = z.object({
  type: z.enum(componentTypes),
  defaultContent: contentSchema,
});
export type AddComponentInput = z.infer<typeof addComponentSchema>;

export const updateComponentSchema = z.object({
  defaultContent: contentSchema,
});
export type UpdateComponentInput = z.infer<typeof updateComponentSchema>;

export const createPersonalizationSchema = z.object({
  audienceId: z.string().min(1),
  content: contentSchema,
  priority: z.number().int().min(0).max(1000).default(0),
});
export type CreatePersonalizationInput = z.infer<typeof createPersonalizationSchema>;
