import { z } from "zod";

export const generateImageSchema = z.object({
  audienceId: z.string().min(1),
  brief: z.string().trim().max(300).optional(),
  // Required (server-checked, never inferred) before generating on a
  // RESTRICTED-boundary element — see assertBoundaryAllows in
  // src/lib/sites/personalization.ts.
  acknowledgedRestricted: z.boolean().default(false),
});
export type GenerateImageInput = z.infer<typeof generateImageSchema>;
