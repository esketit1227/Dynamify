import { z } from "zod";

const ruleOperators = [
  "EQUALS",
  "NOT_EQUALS",
  "CONTAINS",
  "IN",
  "GREATER_THAN",
  "LESS_THAN",
  "EXISTS",
] as const;

const ruleValue = z.union([
  z.string().max(500),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string().max(200), z.number()])).max(50),
]);

export const audienceRuleInputSchema = z.object({
  field: z.string().trim().min(1).max(100),
  operator: z.enum(ruleOperators),
  value: ruleValue,
  groupIndex: z.number().int().min(0).max(50).default(0),
});
export type AudienceRuleInput = z.infer<typeof audienceRuleInputSchema>;

export const createAudienceSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  rules: z.array(audienceRuleInputSchema).max(50).default([]),
});
export type CreateAudienceInput = z.infer<typeof createAudienceSchema>;

export const updateAudienceSchema = createAudienceSchema;
export type UpdateAudienceInput = z.infer<typeof updateAudienceSchema>;
