import { z } from "zod";

export const FUNDER_LOCATION_VALUES = ["US", "UK", "EU", "CA", "AU", "Global"] as const;

export const step1Schema = z.object({
  businessName: z.string().min(2, "Business name is required"),
  registrationNumber: z.string().optional(),
  location: z.string().min(2, "Location is required"),
  funderLocations: z.array(z.enum(FUNDER_LOCATION_VALUES)).optional().default([]),
  websiteUrl: z.string().url("Please enter a valid URL").optional().or(z.literal("")),
});

export const step2Schema = z.object({
  sector: z.string().min(1, "Please select a sector"),
  missionStatement: z.string().min(20, "Mission statement must be at least 20 characters"),
  description: z.string().min(50, "Description must be at least 50 characters"),
});

export const step3Schema = z.object({
  employeeCount: z.coerce.number().int().min(1, "Must have at least 1 employee").optional(),
  annualRevenue: z.coerce.number().min(0).optional(),
  previousGrants: z.string().optional(),
});

export const FUNDING_PURPOSES = [
  "Marketing & Customer Acquisition",
  "Product Development",
  "Research & Development",
  "Hiring & Team Expansion",
  "Equipment & Infrastructure",
  "Business Expansion / New Markets",
  "Working Capital",
  "Technology & Software",
  "Training & Skills Development",
  "Sustainability & Green Initiatives",
  "Export & International Growth",
  "Prototyping & Testing",
  "IP & Patent Filing",
  "Other",
] as const;

export const step4Schema = z.object({
  fundingMin: z.coerce.number().min(1, "Minimum funding amount is required"),
  fundingMax: z.coerce.number().min(1, "Maximum funding amount is required"),
  fundingPurposes: z.array(z.string()).min(1, "Select at least one funding purpose"),
  fundingDetails: z.string().optional(),
}).refine((data) => data.fundingMax >= data.fundingMin, {
  message: "Maximum must be greater than or equal to minimum",
  path: ["fundingMax"],
});

export const step5Schema = z.object({
  documents: z.array(z.object({
    name: z.string(),
    url: z.string(),
    type: z.string(),
    size: z.number(),
  })).optional(),
});

/** Phone for WhatsApp: optional; if provided, must have at least 10 digits. */
export const notificationPreferencesSchema = z.object({
  phoneNumber: z
    .string()
    .optional()
    .transform((v) => (v?.trim() === "" ? undefined : v?.trim()))
    .refine(
      (v) => v == null || v.replace(/\D/g, "").length >= 10,
      "Enter a valid phone number (e.g. +44 7123 456789)"
    ),
  whatsappOptIn: z.boolean(),
});

export type Step1Data = z.infer<typeof step1Schema>;
export type Step2Data = z.infer<typeof step2Schema>;
export type Step3Data = z.infer<typeof step3Schema>;
export type Step4Data = z.infer<typeof step4Schema>;
export type Step5Data = z.infer<typeof step5Schema>;
export type NotificationPreferencesData = z.infer<typeof notificationPreferencesSchema>;

export const SECTORS = [
  "Technology",
  "Healthcare",
  "Manufacturing",
  "Creative Industries",
  "Energy",
  "Agriculture",
  "Education",
  "Financial Services",
  "Retail",
  "Construction",
  "Social Enterprise",
  "Food & Drink",
  "Tourism",
  "Defence",
  "Other",
] as const;
