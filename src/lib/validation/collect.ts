import { z } from "zod";

const eventTypes = [
  "PAGE_VIEW",
  "PERSONALIZATION_IMPRESSION",
  "CTA_CLICK",
  "FORM_START",
  "FORM_SUBMIT",
  "CONVERSION",
] as const;

// Small, bounded — this is a public, unauthenticated endpoint, so every
// field is validated and nothing free-form or unbounded is accepted.
export const collectEventSchema = z.object({
  visitorId: z.string().uuid(),
  pageId: z.string().min(1).max(50),
  type: z.enum(eventTypes),
  componentId: z.string().max(50).optional(),
  componentVariantId: z.string().max(50).optional(),
  campaignId: z.string().max(50).optional(),
  metadata: z.record(z.string().max(50), z.union([z.string().max(200), z.number(), z.boolean()])).optional(),
});
export type CollectEventInput = z.infer<typeof collectEventSchema>;
