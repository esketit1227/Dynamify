import { z } from "zod";

export const createSiteSchema = z.object({
  url: z.string().trim().url().max(2000),
});
export type CreateSiteInput = z.infer<typeof createSiteSchema>;

export const updateSiteSchema = z.object({
  ipEnrichmentEnabled: z.boolean().optional(),
  visitorTrackingEnabled: z.boolean().optional(),
  // Capped at 50 — can't hold back more than half of qualifying traffic
  // (src/lib/experiments/holdout.ts). 0 (the default) means no holdout.
  holdbackPercent: z.number().int().min(0).max(50).optional(),
  // Off by default. Only ever skips manual approval for AI-generated
  // images on an ALLOWED-boundary element (src/lib/sites/generateImage.ts)
  // — never Restricted/Never, regardless of this setting.
  autoApproveAiContent: z.boolean().optional(),
});
export type UpdateSiteInput = z.infer<typeof updateSiteSchema>;
