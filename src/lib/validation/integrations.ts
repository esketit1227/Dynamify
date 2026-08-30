import { z } from "zod";

export const addDomainSchema = z.object({
  hostname: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(253)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/, "Enter a valid domain"),
});
export type AddDomainInput = z.infer<typeof addDomainSchema>;

const eventTypes = [
  "PAGE_VIEW",
  "PERSONALIZATION_IMPRESSION",
  "CTA_CLICK",
  "FORM_START",
  "FORM_SUBMIT",
  "CONVERSION",
] as const;

export const createWebhookSchema = z.object({
  url: z.string().trim().url().max(2000),
  eventTypes: z.array(z.enum(eventTypes)).min(1).max(eventTypes.length),
});
export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
