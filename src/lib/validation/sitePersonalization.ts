import { z } from "zod";
import { DANGEROUS_URL_SCHEME } from "@/lib/validation/pages";

// Same javascript:/data:/vbscript: scheme rejection already applied to
// AI-generated content (safeContentString, src/lib/validation/pages.ts) —
// this field can personalize a CTA_HREF or an IMAGE/LOGO src, not just
// prose, so any manually-typed or manually-edited value needs the same
// guard. Shared by both create (below) and the rule-content-edit schema
// (src/lib/sites/personalization.ts's updateElementPersonalizationRuleContent)
// so the two paths can't quietly drift apart.
export const elementVariantContentSchema = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .refine((value) => !DANGEROUS_URL_SCHEME.test(value), "That value isn't allowed here");

export const createElementPersonalizationSchema = z.object({
  audienceId: z.string().min(1),
  content: elementVariantContentSchema,
  priority: z.number().int().min(0).max(1000).default(0),
  // Who/what actually produced this content — defaults to MANUAL since
  // that's the only path with no upstream method to report (a human typed
  // it directly). suggest-variant callers pass their own real method
  // through instead of defaulting.
  method: z.enum(["MANUAL", "AI", "HEURISTIC"]).default("MANUAL"),
  // Required (server-checked, never inferred) before targeting a
  // RESTRICTED-boundary element — see assertBoundaryAllows in
  // src/lib/sites/personalization.ts.
  acknowledgedRestricted: z.boolean().default(false),
});
export type CreateElementPersonalizationInput = z.infer<typeof createElementPersonalizationSchema>;

// The "rewrite this piece" body — deliberately no audienceId/priority/
// method/acknowledgedRestricted here: this never re-targets anything, it
// only ever replaces the text of a rule that already exists.
export const updateElementPersonalizationRuleContentSchema = z.object({
  content: elementVariantContentSchema,
});
export type UpdateElementPersonalizationRuleContentInput = z.infer<
  typeof updateElementPersonalizationRuleContentSchema
>;

// null resets the element back to its type default
// (src/lib/sites/boundaries.ts) rather than leaving a stale override.
export const setElementBoundarySchema = z.object({
  boundary: z.enum(["ALLOWED", "RESTRICTED", "NEVER"]).nullable(),
});
export type SetElementBoundaryInput = z.infer<typeof setElementBoundarySchema>;
