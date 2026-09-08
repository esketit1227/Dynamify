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

// Mirrors SiteEventType exactly (docs/decisions.md D12) — the real,
// current event taxonomy recordSiteEvent produces, not the old model's.
const eventTypes = ["PAGE_VIEW", "CTA_CLICK", "LEAD", "SALE"] as const;

export const createWebhookSchema = z.object({
  url: z.string().trim().url().max(2000),
  eventTypes: z.array(z.enum(eventTypes)).min(1).max(eventTypes.length),
});
export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
