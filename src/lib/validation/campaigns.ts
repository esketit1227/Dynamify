import { z } from "zod";

const eventTypes = [
  "PAGE_VIEW",
  "PERSONALIZATION_IMPRESSION",
  "CTA_CLICK",
  "FORM_START",
  "FORM_SUBMIT",
  "CONVERSION",
] as const;

export const createCampaignSchema = z.object({
  name: z.string().trim().min(1).max(100),
  pageId: z.string().min(1),
  audienceId: z.string().min(1).optional(),
  trafficSource: z.string().trim().max(100).optional(),
  goalEventType: z.enum(eventTypes),
  splitPercent: z.number().int().min(1).max(99).default(50),
});
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

export const updateCampaignStatusSchema = z.object({
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "COMPLETED"]),
});
export type UpdateCampaignStatusInput = z.infer<typeof updateCampaignStatusSchema>;

export const campaignAssignmentRequestSchema = z.object({
  campaignId: z.string().min(1),
  visitorId: z.string().uuid(),
});
export type CampaignAssignmentRequestInput = z.infer<typeof campaignAssignmentRequestSchema>;
