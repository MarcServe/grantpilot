import { z } from "zod";
import { ELIGIBILITY_FACT_CATEGORIES, ELIGIBILITY_FACT_CONFIDENCE_VALUES } from "@/lib/eligibility-facts";

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

export const LEGAL_STRUCTURES = [
  "Limited company",
  "Sole trader",
  "Partnership",
  "Limited liability partnership",
  "Charity",
  "Community interest company",
  "Social enterprise",
  "University / research organisation",
  "Public sector body",
  "Other",
] as const;

export const BUSINESS_STAGES = [
  "Idea / pre-trading",
  "Pre-revenue startup",
  "Early-stage startup",
  "Established SME",
  "Growth / scale-up",
  "Enterprise",
  "Other",
] as const;

export const BUSINESS_SIZE_BANDS = [
  "Solo founder",
  "Micro business (1-9 employees)",
  "Small business (10-49 employees)",
  "Medium business (50-249 employees)",
  "Large business (250+ employees)",
  "Not sure",
] as const;

export const FOUNDER_EMPLOYMENT_STATUSES = [
  "Full-time founder",
  "Part-time founder",
  "Self-employed",
  "Employed and building on the side",
  "Team-led company",
  "Other",
] as const;

export const PREVIOUS_GRANT_EXPERIENCE = [
  "First-time grant applicant",
  "Applied before",
  "Previously awarded",
  "Previously rejected",
  "Regular grant applicant",
  "Not sure",
] as const;

export const CO_FUNDING_CAPACITY = [
  "None confirmed",
  "Can contribute up to 10%",
  "Can contribute 10-25%",
  "Can contribute 25-50%",
  "Can contribute 50%+",
  "In-kind support only",
  "Not sure",
] as const;

export const REIMBURSEMENT_READINESS = [
  "Can pay upfront and reclaim",
  "Limited upfront cash",
  "Needs advance payment",
  "Not sure",
] as const;

export const PREFERRED_OPPORTUNITY_TYPES = [
  "Grant",
  "Loan",
  "Innovation competition",
  "Accelerator",
  "Business support",
  "Software / startup perk",
  "Procurement / contract",
] as const;

export const step1Schema = z.object({
  businessName: z.string().min(2, "Business name is required"),
  tradingName: z.string().optional(),
  businessType: z.string().optional(),
  legalStructure: z.string().optional(),
  businessStage: z.string().optional(),
  businessSizeBand: z.string().optional(),
  founderEmploymentStatus: z.string().optional(),
  registrationNumber: z.string().optional(),
  charityNumber: z.string().optional(),
  vatNumber: z.string().optional(),
  yearEstablished: z.coerce.number().int().min(1800).max(new Date().getFullYear()).optional().or(z.literal("")),
  incorporationDate: z.string().optional(),
  tradingStartDate: z.string().optional(),
  employeeCount: z.coerce.number().int().min(0).optional().or(z.literal("")),
  expectedEmployeeGrowth: z.string().optional(),
  location: z.string().min(2, "Location is required"),
  registeredAddress: z.string().optional(),
  operatingAddress: z.string().optional(),
  postcode: z.string().optional(),
  country: z.string().optional(),
  region: z.string().optional(),
  localAuthority: z.string().optional(),
  areasServed: z.string().optional(),
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
  previousGrantExperience: z.string().optional(),
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
  preferredOpportunityTypes: z.array(z.string()).optional().default([]),
  coFundingCapacity: z.string().optional(),
  reimbursementReadiness: z.string().optional(),
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

export const eligibilityFactSchema = z.object({
  id: z.string().optional(),
  label: z.string().trim().min(2, "Add a short fact label").max(120),
  value: z.string().trim().min(2, "Add the confirmed fact").max(500),
  category: z.enum(ELIGIBILITY_FACT_CATEGORIES).optional().or(z.literal("")),
  evidence: z.string().trim().max(700).optional().or(z.literal("")),
  source: z.enum(["manual", "ai_suggested"]).optional().default("manual"),
  confidence: z.enum(ELIGIBILITY_FACT_CONFIDENCE_VALUES).optional().default("confirmed"),
  updatedAt: z.string().optional(),
});

export const step7Schema = z.object({
  eligibilityFacts: z.array(eligibilityFactSchema).max(40).default([]),
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
export type Step7Data = z.infer<typeof step7Schema>;
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
