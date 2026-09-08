import { z } from "zod";

// ruleAId !== ruleBId is enforced again in the service layer
// (createBanditExperiment) against the real rows, not just the raw
// strings — this refine is just the cheap, immediate rejection of the
// obviously-invalid "same rule twice" request before any query runs.
export const createBanditExperimentSchema = z
  .object({
    audienceId: z.string().min(1),
    ruleAId: z.string().min(1),
    ruleBId: z.string().min(1),
  })
  .refine((data) => data.ruleAId !== data.ruleBId, {
    message: "Choose two different rules to compete against each other",
    path: ["ruleBId"],
  });
export type CreateBanditExperimentInput = z.infer<typeof createBanditExperimentSchema>;
