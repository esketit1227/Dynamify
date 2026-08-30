import { z } from "zod";

// Accepting a recommendation only lets a human rename the audience it
// creates before it's built — the segment definition itself (field,
// operator, value) is fixed at generation time, not user-editable here.
export const acceptRecommendationSchema = z.object({
  audienceName: z.string().trim().min(1).max(200).optional(),
});
export type AcceptRecommendationInput = z.infer<typeof acceptRecommendationSchema>;
