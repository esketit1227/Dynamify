import { z } from "zod";

export const generateAudienceProposalSchema = z.object({
  businessDescription: z.string().trim().min(1).max(1000),
});
export type GenerateAudienceProposalInput = z.infer<typeof generateAudienceProposalSchema>;

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

export const generateCopyProposalSchema = z.object({
  componentId: z.string().min(1),
  type: z.enum(componentTypes),
  brief: z.string().trim().min(1).max(1000),
});
export type GenerateCopyProposalInput = z.infer<typeof generateCopyProposalSchema>;
