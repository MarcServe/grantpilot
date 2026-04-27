import { z } from "zod";

export const FUNDER_LOCATION_VALUES = ["US", "UK", "EU", "CA", "AU", "Global"] as const;

export const BUSINESS_TYPES = [
  "SME",
  "Startup",
  "Sole Trader",
  "Charity / Non-profit",
  "Social Enterprise",
  "University / Research",
  "Public Sector",
  "Large Enterprise",
  "Partnership",
  "Other",
] as const;

export const step1Schema = z.object({
  businessName: z.string().min(2, "Business name is required"),
  tradingName: z.string().optional(),
  businessType: z.string().optional(),
  registrationNumber: z.string().optional(),
  charityNumber: z.string().optional(),
  vatNumber: z.string().optional(),
  yearEstablished: z.coerce.number().int().min(1800).max(new Date().getFullYear()).optional().or(z.literal("")),
  location: z.string().min(2, "Location is required"),
  registeredAddress: z.string().optional(),
  operatingAddress: z.string().optional(),
  postcode: z.string().optional(),
  country: z.string().optional(),
  region: z.string().optional(),
  primaryContactName: z.string().optional(),
  primaryContactRole: z.string().optional(),
  primaryContactEmail: z.string().email("Enter a valid email").optional().or(z.literal("")),
  primaryContactPhone: z.string().optional(),
  primaryContactLinkedIn: z.string().url("Enter a valid URL").optional().or(z.literal("")),
  preferredContactMethod: z.string().optional(),
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
  contractorCount: z.coerce.number().int().min(0).optional().or(z.literal("")),
  annualRevenue: z.coerce.number().min(0).optional(),
  profitLoss: z.string().optional(),
  cashReserves: z.string().optional(),
  financialProjections: z.string().optional(),
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
  coFundingAvailable: z.string().optional(),
  matchFundingDetails: z.string().optional(),
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

export const step6Schema = z.object({
  directorNames: z.string().optional(),
  directorProfiles: z.string().optional(),
  teamMembers: z.string().optional(),
  boardMembers: z.string().optional(),
  founderBackground: z.string().optional(),
  projectTitle: z.string().optional(),
  projectSummary: z.string().optional(),
  problemStatement: z.string().optional(),
  proposedSolution: z.string().optional(),
  projectObjectives: z.string().optional(),
  expectedOutcomes: z.string().optional(),
  projectStartDate: z.string().optional(),
  projectEndDate: z.string().optional(),
  beneficiaryGroups: z.string().optional(),
  beneficiaryCount: z.coerce.number().int().min(0).optional().or(z.literal("")),
  geographicImpact: z.string().optional(),
  diversityInclusionImpact: z.string().optional(),
  jobsCreated: z.coerce.number().int().min(0).optional().or(z.literal("")),
  revenueGrowthExpected: z.string().optional(),
  co2Reduction: z.string().optional(),
  productivityImprovements: z.string().optional(),
  milestones: z.string().optional(),
  deliverables: z.string().optional(),
  partnerOrganisations: z.string().optional(),
  collaborationDetails: z.string().optional(),
  risksMitigation: z.string().optional(),
  exitStrategy: z.string().optional(),
  projectSustainabilityPlan: z.string().optional(),
  socialImpact: z.string().optional(),
  innovationCapabilities: z.string().optional(),
  sustainabilityInitiatives: z.string().optional(),
  communityEngagement: z.string().optional(),
  keyAchievements: z.string().optional(),
  teamExpertise: z.string().optional(),
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
export type Step6Data = z.infer<typeof step6Schema>;
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
