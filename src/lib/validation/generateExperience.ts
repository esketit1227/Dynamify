import { z } from "zod";

export const generateExperienceSchema = z.object({
  crawledPageId: z.string().min(1),
  audienceId: z.string().min(1),
  // Required (server-checked, never inferred) before generating on any
  // RESTRICTED-boundary element in the batch — same one-time
  // acknowledgment assertBoundaryAllows enforces everywhere else
  // (src/lib/sites/personalization.ts), applied once per generation here
  // rather than once per element.
  acknowledgedRestricted: z.boolean().default(false),
  // Off by default — also calls the existing single-image pipeline for
  // eligible IMAGE/LOGO elements instead of just reselecting one found
  // elsewhere on the site.
  generateImages: z.boolean().default(false),
});
export type GenerateExperienceInput = z.infer<typeof generateExperienceSchema>;
