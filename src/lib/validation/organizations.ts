import { z } from "zod";

// docs/visitor-data.md Retention: "our defaults as the maximum, not the
// minimum" — a merchant can shorten these windows, never extend them
// past what this product ships as the ceiling.
export const setRetentionWindowsSchema = z.object({
  rawEventRetentionDays: z.number().int().min(1).max(395),
  sessionRetentionDays: z.number().int().min(1).max(90),
  visitorRetentionDays: z.number().int().min(1).max(730),
});
export type SetRetentionWindowsInput = z.infer<typeof setRetentionWindowsSchema>;
