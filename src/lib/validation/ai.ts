import { z } from "zod";

export const generateAudienceProposalSchema = z.object({
  businessDescription: z.string().trim().min(1).max(1000),
});
export type GenerateAudienceProposalInput = z.infer<typeof generateAudienceProposalSchema>;
