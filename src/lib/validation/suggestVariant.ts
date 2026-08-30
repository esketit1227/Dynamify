import { z } from "zod";
import { visitorContextSchema } from "@/lib/validation/visitorContext";

export const suggestVariantSchema = visitorContextSchema;
export type SuggestVariantInput = z.infer<typeof suggestVariantSchema>;
