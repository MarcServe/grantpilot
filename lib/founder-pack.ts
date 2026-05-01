import { cleanJsonResponse, completeJson } from "@/lib/openai-client";

export interface FounderPackInputs {
  founderName: string;
  founderRole: string;
  founderBackground: string;
  technicalContribution: string;
  targetUse: "innovator_founder_visa" | "funding_readiness" | "accelerator_investor";
  documentTypes?: FounderPackDocumentType[];
  marketFocus: string;
  revenueModel: string;
  pricingAssumptions: string;
  hiringPlan: string;
  additionalNotes?: string;
}

export type FounderPackDocumentType =
  | "executive_summary"
  | "business_plan"
  | "innovation_statement"
  | "market_analysis"
  | "financial_projections"
  | "founder_positioning"
  | "scalability_plan"
  | "risk_mitigation"
  | "evidence_checklist"
  | "next_steps";

export const FOUNDER_PACK_DOCUMENT_TYPES: {
  value: FounderPackDocumentType;
  label: string;
  description: string;
}[] = [
  { value: "executive_summary", label: "Executive Summary", description: "Visa/investor-ready business overview." },
  { value: "business_plan", label: "Business Plan", description: "Model, operations, go-to-market, and milestones." },
  { value: "innovation_statement", label: "Innovation Statement", description: "USP, technical novelty, and defensibility." },
  { value: "market_analysis", label: "Market Analysis", description: "Customers, market need, competition, and demand." },
  { value: "financial_projections", label: "Financial Projections", description: "Assumptions and 3-year planning lines." },
  { value: "founder_positioning", label: "Founder Positioning", description: "Why the founder is credible and central." },
  { value: "scalability_plan", label: "Scalability Plan", description: "Growth, hiring, partnerships, and expansion." },
  { value: "risk_mitigation", label: "Risks & Mitigation", description: "Key execution risks and controls." },
  { value: "evidence_checklist", label: "Evidence Checklist", description: "Documents and proof needed to support claims." },
  { value: "next_steps", label: "Next Steps", description: "Action plan to complete the pack." },
];

export interface FounderPackContent {
  executiveSummary: string;
  businessPlan: string;
  innovationStatement: string;
  marketAnalysis: string;
  financialProjections: {
    assumptions: string[];
    year1: string[];
    year2: string[];
    year3: string[];
  };
  founderPositioning: string;
  scalabilityPlan: string;
  riskMitigation: { risk: string; mitigation: string }[];
  evidenceChecklist: string[];
  nextSteps: string[];
  disclaimer: string;
}

type BusinessProfileLike = Record<string, unknown>;

function text(value: unknown): string {
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  return String(value ?? "");
}

export function buildFounderPackProfileContext(profile: BusinessProfileLike): string {
  const fields = [
    "businessName",
    "businessType",
    "sector",
    "missionStatement",
    "description",
    "location",
    "employeeCount",
    "annualRevenue",
    "fundingMin",
    "fundingMax",
    "fundingPurposes",
    "fundingDetails",
    "websiteUrl",
    "websiteIntelligence",
    "socialImpact",
    "innovationCapabilities",
    "sustainabilityInitiatives",
    "communityEngagement",
    "keyAchievements",
    "teamExpertise",
    "founderBackground",
    "projectTitle",
    "projectSummary",
    "problemStatement",
    "proposedSolution",
    "projectObjectives",
    "expectedOutcomes",
    "milestones",
    "deliverables",
    "partnerOrganisations",
    "collaborationDetails",
    "risksMitigation",
    "projectSustainabilityPlan",
    "jobsCreated",
    "revenueGrowthExpected",
  ];
  return fields
    .map((field) => `${field}: ${text(profile[field])}`)
    .filter((line) => !line.endsWith(": "))
    .join("\n");
}

function normaliseContent(raw: unknown): FounderPackContent {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const projection = data.financialProjections && typeof data.financialProjections === "object"
    ? (data.financialProjections as Record<string, unknown>)
    : {};
  const list = (value: unknown): string[] =>
    Array.isArray(value) ? value.map((item) => String(item ?? "").trim()).filter(Boolean) : [];
  const risks = Array.isArray(data.riskMitigation)
    ? data.riskMitigation
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const row = item as Record<string, unknown>;
          return {
            risk: String(row.risk ?? "").trim(),
            mitigation: String(row.mitigation ?? "").trim(),
          };
        })
        .filter((item): item is { risk: string; mitigation: string } => Boolean(item?.risk && item.mitigation))
    : [];

  return {
    executiveSummary: String(data.executiveSummary ?? "").trim(),
    businessPlan: String(data.businessPlan ?? "").trim(),
    innovationStatement: String(data.innovationStatement ?? "").trim(),
    marketAnalysis: String(data.marketAnalysis ?? "").trim(),
    financialProjections: {
      assumptions: list(projection.assumptions),
      year1: list(projection.year1),
      year2: list(projection.year2),
      year3: list(projection.year3),
    },
    founderPositioning: String(data.founderPositioning ?? "").trim(),
    scalabilityPlan: String(data.scalabilityPlan ?? "").trim(),
    riskMitigation: risks,
    evidenceChecklist: list(data.evidenceChecklist),
    nextSteps: list(data.nextSteps),
    disclaimer:
      String(data.disclaimer ?? "").trim() ||
      "This pack is a business planning aid and is not immigration, legal, financial, or endorsement advice.",
  };
}

export async function generateFounderPack(
  profile: BusinessProfileLike,
  inputs: FounderPackInputs
): Promise<FounderPackContent> {
  const selectedTypes =
    inputs.documentTypes?.length
      ? inputs.documentTypes
      : FOUNDER_PACK_DOCUMENT_TYPES.map((item) => item.value);
  const selectedLabels = FOUNDER_PACK_DOCUMENT_TYPES
    .filter((item) => selectedTypes.includes(item.value))
    .map((item) => `- ${item.label}: ${item.description}`)
    .join("\n");

  const prompt = `You are a senior UK startup advisor preparing an export-ready founder funding pack.

The pack should help a founder explain an innovative, viable, and scalable business. It may support an Innovator Founder Visa business plan, grant applications, accelerator applications, or investor-readiness work, but must not claim approval is guaranteed.

Official framing to address:
- Innovation: original business plan, clear USP, competitive advantage, difficult to replicate, innovation delivered inside the business.
- Viability: realistic business model, resources, founder skills, market awareness.
- Scalability: structured planning, job creation, UK and international growth potential.

Business profile:
${buildFounderPackProfileContext(profile)}

Founder and pack inputs:
- Founder name: ${inputs.founderName}
- Founder role: ${inputs.founderRole}
- Founder background: ${inputs.founderBackground}
- Technical contribution: ${inputs.technicalContribution}
- Target use: ${inputs.targetUse}
- Market focus: ${inputs.marketFocus}
- Revenue model: ${inputs.revenueModel}
- Pricing and projection assumptions: ${inputs.pricingAssumptions}
- Hiring/job creation plan: ${inputs.hiringPlan}
- Additional notes: ${inputs.additionalNotes ?? ""}

Generate these document sections only. For unselected sections, return an empty string or empty array while preserving the required JSON shape:
${selectedLabels}

Write in polished UK business English. Be specific to this company. Do not invent exact revenue, customers, contracts, awards, grants, patents, or endorsements unless present in the profile or inputs. Where evidence is missing, use cautious planning language and add the missing evidence to the checklist.

Return ONLY valid JSON with this exact shape:
{
  "executiveSummary": "section text",
  "businessPlan": "section text with business model, product, operations, go-to-market, and milestones",
  "innovationStatement": "section text",
  "marketAnalysis": "section text",
  "financialProjections": {
    "assumptions": ["assumption"],
    "year1": ["revenue/cost/milestone line"],
    "year2": ["revenue/cost/milestone line"],
    "year3": ["revenue/cost/milestone line"]
  },
  "founderPositioning": "section text positioning the founder as a key technical/commercial founder",
  "scalabilityPlan": "section text covering UK, international growth, hiring, partnerships, and repeatable distribution",
  "riskMitigation": [{ "risk": "risk", "mitigation": "mitigation" }],
  "evidenceChecklist": ["document or evidence needed"],
  "nextSteps": ["action"],
  "disclaimer": "short disclaimer"
}`;

  const raw = await completeJson(prompt, 4500);
  const parsed = JSON.parse(cleanJsonResponse(raw)) as unknown;
  return normaliseContent(parsed);
}
