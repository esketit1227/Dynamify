import { z } from "zod";

// Mirrors VisitorContext (packages/sdk/src/types.ts) exactly — every trust
// boundary that accepts a visitor profile from the client (Live View, the
// demo window, suggest-variant, the preview-html route) validates against
// this one shape rather than each inventing its own subset.
export const visitorContextSchema = z.object({
  device: z.enum(["desktop", "mobile", "tablet", "unknown"]).optional(),
  geo: z
    .object({
      country: z.string().trim().max(100).optional(),
      region: z.string().trim().max(100).optional(),
      city: z.string().trim().max(100).optional(),
    })
    .optional(),
  referrer: z.string().trim().max(500).optional(),
  utm: z
    .object({
      source: z.string().trim().max(100).optional(),
      medium: z.string().trim().max(100).optional(),
      campaign: z.string().trim().max(100).optional(),
      term: z.string().trim().max(100).optional(),
      content: z.string().trim().max(100).optional(),
    })
    .optional(),
  returning: z.boolean().optional(),
  sessionCount: z.number().int().min(0).max(100_000).optional(),
  attributes: z
    .record(z.string().trim().min(1).max(60), z.union([z.string().max(200), z.number(), z.boolean()]))
    .refine((attrs) => Object.keys(attrs).length <= 10, "Too many custom attributes")
    .optional(),
});
