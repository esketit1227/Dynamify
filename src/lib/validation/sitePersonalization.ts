import { z } from "zod";
import { DANGEROUS_URL_SCHEME } from "@/lib/validation/pages";

export const createElementPersonalizationSchema = z.object({
  audienceId: z.string().min(1),
  // Same javascript:/data:/vbscript: scheme rejection already applied to
  // AI-generated content (safeContentString, src/lib/validation/pages.ts)
  // — this field can now personalize a CTA_HREF or an IMAGE/LOGO src, not
  // just prose, so a manually-typed value needs the same guard.
  content: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .refine((value) => !DANGEROUS_URL_SCHEME.test(value), "That value isn't allowed here"),
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

// null resets the element back to its type default
// (src/lib/sites/boundaries.ts) rather than leaving a stale override.
export const setElementBoundarySchema = z.object({
  boundary: z.enum(["ALLOWED", "RESTRICTED", "NEVER"]).nullable(),
});
export type SetElementBoundaryInput = z.infer<typeof setElementBoundarySchema>;
