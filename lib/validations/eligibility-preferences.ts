import { z } from "zod";

export const eligibilityPreferencesSchema = z.object({
  minScore: z.coerce.number().int().min(0).max(100),
  maxScore: z.coerce.number().int().min(0).max(100),
  eligibleThreshold: z.coerce.number().int().min(0).max(100).optional(),
  notifyEmail: z.boolean(),
  notifyInApp: z.boolean(),
  notifyWhatsApp: z.boolean().optional(),
}).refine((d) => d.maxScore >= d.minScore, { message: "max_score must be >= min_score", path: ["maxScore"] });

export type EligibilityPreferencesData = z.infer<typeof eligibilityPreferencesSchema>;
