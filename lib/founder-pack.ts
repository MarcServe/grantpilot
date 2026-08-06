import { cleanJsonResponse, completeJson } from "@/lib/openai-client";
import { eligibilityFactsToText } from "@/lib/eligibility-facts";

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
  /** Application IDs (org-owned) whose Grant rows inform bespoke pack generation */
  selectedApplicationIds?: string[];
  /** Grant IDs from eligibility scoring for this profile (no application required yet) */
  selectedEligibleGrantIds?: string[];
  /** Free-text funder criteria, eligibility bullets, form questions, or URLs pasted by founder */
  grantRequirementsNotes?: string;
}

export type FounderPackQuestionAssistantMode =
  | "draft_answer"
  | "evidence_check"
  | "improve_existing_answer";

export interface FounderPackQuestionInput {
  question: string;
  wordLimit?: number;
  guidance?: string;
}

export interface FounderPackQuestionAssistantInputs {
  questions: FounderPackQuestionInput[];
  outputMode?: FounderPackQuestionAssistantMode;
  existingAnswer?: string;
  pastedGrantContext?: string;
}

export type FounderPackAnswerConfidence = "high" | "medium" | "low";
export type FounderPackEvidenceStrength = "strong" | "medium" | "weak";

export interface FounderPackQuestionAnswer {
  question: string;
  draftAnswer: string;
  rationale: string;
  confidence: FounderPackAnswerConfidence;
  evidenceStrength: FounderPackEvidenceStrength;
  missingEvidence: string[];
  suggestedProfileUpdates: string[];
  warnings: string[];
}

export type FounderPackDocumentType =
  | "executive_summary"
  | "business_plan"
  | "pitch_deck"
  | "business_model_canvas"
  | "innovation_statement"
  | "market_analysis"
  | "financial_projections"
  | "grant_application_draft"
  | "budget_narrative"
  | "impact_measurement_plan"
  | "project_workplan"
  | "support_letter_template"
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
  { value: "pitch_deck", label: "Canvas Standard Pitch Deck", description: "10-12 slide deck copy, speaker notes, and design direction." },
  { value: "business_model_canvas", label: "Business Model Canvas", description: "Partners, activities, value proposition, customers, costs, and revenue." },
  { value: "innovation_statement", label: "Innovation Statement", description: "USP, technical novelty, and defensibility." },
  { value: "market_analysis", label: "Market Analysis", description: "Customers, market need, competition, and demand." },
  { value: "financial_projections", label: "Financial Projections", description: "Assumptions and 3-year planning lines." },
  { value: "grant_application_draft", label: "Grant Application Draft", description: "Reusable grant answers for need, project, impact, and delivery." },
  { value: "budget_narrative", label: "Budget Narrative", description: "Plain-English explanation of how funding will be spent." },
  { value: "impact_measurement_plan", label: "Impact Measurement Plan", description: "Outputs, outcomes, KPIs, and reporting approach." },
  { value: "project_workplan", label: "Project Workplan", description: "Phases, activities, outputs, and timeline for funders." },
  { value: "support_letter_template", label: "Support Letter Template", description: "Partner/referee letter template aligned to the funding case." },
  { value: "founder_positioning", label: "Founder Positioning", description: "Why the founder is credible and central." },
  { value: "scalability_plan", label: "Scalability Plan", description: "Growth, hiring, partnerships, and expansion." },
  { value: "risk_mitigation", label: "Risks & Mitigation", description: "Key execution risks and controls." },
  { value: "evidence_checklist", label: "Evidence Checklist", description: "Documents and proof needed to support claims." },
  { value: "next_steps", label: "Next Steps", description: "Action plan to complete the pack." },
];

export interface PitchDeckSlide {
  title: string;
  objective: string;
  bullets: string[];
  speakerNotes: string;
  visualDirection: string;
}

export interface BusinessModelCanvas {
  keyPartners: string[];
  keyActivities: string[];
  keyResources: string[];
  valuePropositions: string[];
  customerRelationships: string[];
  channels: string[];
  customerSegments: string[];
  costStructure: string[];
  revenueStreams: string[];
}

export interface GrantApplicationAnswer {
  question: string;
  answer: string;
}

export interface ProjectWorkplanPhase {
  phase: string;
  timeline: string;
  activities: string[];
  outputs: string[];
}

export interface FounderPackContent {
  executiveSummary: string;
  businessPlan: string;
  pitchDeck: PitchDeckSlide[];
  businessModelCanvas: BusinessModelCanvas;
  innovationStatement: string;
  marketAnalysis: string;
  financialProjections: {
    assumptions: string[];
    year1: string[];
    year2: string[];
    year3: string[];
  };
  grantApplicationDraft: GrantApplicationAnswer[];
  budgetNarrative: string;
  impactMeasurementPlan: string;
  projectWorkplan: ProjectWorkplanPhase[];
  supportLetterTemplate: string;
  founderPositioning: string;
  scalabilityPlan: string;
  riskMitigation: { risk: string; mitigation: string }[];
  evidenceChecklist: string[];
  nextSteps: string[];
  disclaimer: string;
}

type BusinessProfileLike = Record<string, unknown>;
interface FounderPackSanitiseContext {
  businessName?: string | null;
  founderName?: string | null;
  founderRole?: string | null;
}

function text(value: unknown): string {
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  return String(value ?? "");
}

export function buildFounderPackProfileContext(profile: BusinessProfileLike): string {
  const fields = [
    "businessName",
    "businessType",
    "legalStructure",
    "businessStage",
    "businessSizeBand",
    "founderEmploymentStatus",
    "sector",
    "missionStatement",
    "description",
    "location",
    "localAuthority",
    "areasServed",
    "employeeCount",
    "expectedEmployeeGrowth",
    "yearEstablished",
    "incorporationDate",
    "tradingStartDate",
    "annualRevenue",
    "fundingMin",
    "fundingMax",
    "fundingPurposes",
    "preferredOpportunityTypes",
    "fundingDetails",
    "fundingUrgency",
    "fundingPosition",
    "documentReadiness",
    "coFundingCapacity",
    "reimbursementReadiness",
    "coFundingAvailable",
    "matchFundingDetails",
    "previousGrantExperience",
    "previousGrantHistory",
    "websiteUrl",
    "websiteIntelligence",
    "socialImpact",
    "innovationCapabilities",
    "sustainabilityInitiatives",
    "communityEngagement",
    "keyAchievements",
    "directorNames",
    "directorProfiles",
    "teamMembers",
    "teamExpertise",
    "boardMembers",
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
  const profileLines = fields
    .map((field) => `${field}: ${text(profile[field])}`)
    .filter((line) => !line.endsWith(": "))
    .join("\n");
  const eligibilityFacts = eligibilityFactsToText(profile.eligibilityFacts, 20);
  return [
    profileLines,
    eligibilityFacts ? `eligibilityFacts: ${eligibilityFacts}` : "",
  ].filter(Boolean).join("\n");
}

function normaliseContent(raw: unknown): FounderPackContent {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const projection = data.financialProjections && typeof data.financialProjections === "object"
    ? (data.financialProjections as Record<string, unknown>)
    : {};
  const list = (value: unknown): string[] =>
    Array.isArray(value) ? value.map((item) => String(item ?? "").trim()).filter(Boolean) : [];
  const objectValue = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
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
  const pitchDeck = Array.isArray(data.pitchDeck)
    ? data.pitchDeck
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const row = item as Record<string, unknown>;
          return {
            title: String(row.title ?? "").trim(),
            objective: String(row.objective ?? "").trim(),
            bullets: list(row.bullets),
            speakerNotes: String(row.speakerNotes ?? "").trim(),
            visualDirection: String(row.visualDirection ?? "").trim(),
          };
        })
        .filter((item): item is PitchDeckSlide => Boolean(item?.title))
    : [];
  const canvas = objectValue(data.businessModelCanvas);
  const grantApplicationDraft = Array.isArray(data.grantApplicationDraft)
    ? data.grantApplicationDraft
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const row = item as Record<string, unknown>;
          return {
            question: String(row.question ?? "").trim(),
            answer: String(row.answer ?? "").trim(),
          };
        })
        .filter((item): item is GrantApplicationAnswer => Boolean(item?.question && item.answer))
    : [];
  const projectWorkplan = Array.isArray(data.projectWorkplan)
    ? data.projectWorkplan
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const row = item as Record<string, unknown>;
          return {
            phase: String(row.phase ?? "").trim(),
            timeline: String(row.timeline ?? "").trim(),
            activities: list(row.activities),
            outputs: list(row.outputs),
          };
        })
        .filter((item): item is ProjectWorkplanPhase => Boolean(item?.phase))
    : [];

  return {
    executiveSummary: String(data.executiveSummary ?? "").trim(),
    businessPlan: String(data.businessPlan ?? "").trim(),
    pitchDeck,
    businessModelCanvas: {
      keyPartners: list(canvas.keyPartners),
      keyActivities: list(canvas.keyActivities),
      keyResources: list(canvas.keyResources),
      valuePropositions: list(canvas.valuePropositions),
      customerRelationships: list(canvas.customerRelationships),
      channels: list(canvas.channels),
      customerSegments: list(canvas.customerSegments),
      costStructure: list(canvas.costStructure),
      revenueStreams: list(canvas.revenueStreams),
    },
    innovationStatement: String(data.innovationStatement ?? "").trim(),
    marketAnalysis: String(data.marketAnalysis ?? "").trim(),
    financialProjections: {
      assumptions: list(projection.assumptions),
      year1: list(projection.year1),
      year2: list(projection.year2),
      year3: list(projection.year3),
    },
    grantApplicationDraft,
    budgetNarrative: String(data.budgetNarrative ?? "").trim(),
    impactMeasurementPlan: String(data.impactMeasurementPlan ?? "").trim(),
    projectWorkplan,
    supportLetterTemplate: String(data.supportLetterTemplate ?? "").trim(),
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

function possessiveName(name: string): string {
  return name.endsWith("s") ? `${name}'` : `${name}'s`;
}

function sanitiseText(value: string, context: FounderPackSanitiseContext): string {
  const businessName = context.businessName?.trim() || "the business";
  const founderName = context.founderName?.trim() || "the founder";
  const founderRole = context.founderRole?.trim() || "founder";
  let next = String(value ?? "");

  const replacementPairs: Array<[RegExp, string]> = [
    [/\bTalkWeb(?:'s|’s)\b/gi, possessiveName(businessName)],
    [/\bTalkWeb\b/gi, businessName],
    [/\bAcme(?:\s+(?:Ltd|Limited|Inc|Corp|Corporation|Company|Co))?(?:'s|’s)\b/gi, possessiveName(businessName)],
    [/\bAcme(?:\s+(?:Ltd|Limited|Inc|Corp|Corporation|Company|Co))?\b/gi, businessName],
    [/\bExample\s+(?:Ltd|Limited|Company|Co|Startup|Business)(?:'s|’s)\b/gi, possessiveName(businessName)],
    [/\bExample\s+(?:Ltd|Limited|Company|Co|Startup|Business)\b/gi, businessName],
    [/\bSample\s+(?:Ltd|Limited|Company|Co|Startup|Business)(?:'s|’s)\b/gi, possessiveName(businessName)],
    [/\bSample\s+(?:Ltd|Limited|Company|Co|Startup|Business)\b/gi, businessName],
    [/\bDemo\s+(?:Ltd|Limited|Company|Co|Startup|Business)(?:'s|’s)\b/gi, possessiveName(businessName)],
    [/\bDemo\s+(?:Ltd|Limited|Company|Co|Startup|Business)\b/gi, businessName],
    [/\bTest\s+(?:Ltd|Limited|Company|Co|Startup|Business)(?:'s|’s)\b/gi, possessiveName(businessName)],
    [/\bTest\s+(?:Ltd|Limited|Company|Co|Startup|Business)\b/gi, businessName],
    [/\[(?:company|company name|business|business name)\]/gi, businessName],
    [/\{(?:company|company name|business|business name)\}/gi, businessName],
    [/\[(?:founder|founder name)\]/gi, founderName],
    [/\{(?:founder|founder name)\}/gi, founderName],
    [/\[(?:founder role|role)\]/gi, founderRole],
    [/\{(?:founder role|role)\}/gi, founderRole],
  ];

  for (const [pattern, replacement] of replacementPairs) {
    next = next.replace(pattern, replacement);
  }

  return next.trim();
}

function sanitiseList(values: string[], context: FounderPackSanitiseContext): string[] {
  return values.map((item) => sanitiseText(item, context)).filter(Boolean);
}

export function sanitiseFounderPackContent(
  content: FounderPackContent,
  context: FounderPackSanitiseContext = {}
): FounderPackContent {
  return {
    executiveSummary: sanitiseText(content.executiveSummary, context),
    businessPlan: sanitiseText(content.businessPlan, context),
    pitchDeck: (content.pitchDeck ?? []).map((slide) => ({
      title: sanitiseText(slide.title, context),
      objective: sanitiseText(slide.objective, context),
      bullets: sanitiseList(slide.bullets ?? [], context),
      speakerNotes: sanitiseText(slide.speakerNotes, context),
      visualDirection: sanitiseText(slide.visualDirection, context),
    })).filter((slide) => slide.title),
    businessModelCanvas: {
      keyPartners: sanitiseList(content.businessModelCanvas?.keyPartners ?? [], context),
      keyActivities: sanitiseList(content.businessModelCanvas?.keyActivities ?? [], context),
      keyResources: sanitiseList(content.businessModelCanvas?.keyResources ?? [], context),
      valuePropositions: sanitiseList(content.businessModelCanvas?.valuePropositions ?? [], context),
      customerRelationships: sanitiseList(content.businessModelCanvas?.customerRelationships ?? [], context),
      channels: sanitiseList(content.businessModelCanvas?.channels ?? [], context),
      customerSegments: sanitiseList(content.businessModelCanvas?.customerSegments ?? [], context),
      costStructure: sanitiseList(content.businessModelCanvas?.costStructure ?? [], context),
      revenueStreams: sanitiseList(content.businessModelCanvas?.revenueStreams ?? [], context),
    },
    innovationStatement: sanitiseText(content.innovationStatement, context),
    marketAnalysis: sanitiseText(content.marketAnalysis, context),
    financialProjections: {
      assumptions: sanitiseList(content.financialProjections?.assumptions ?? [], context),
      year1: sanitiseList(content.financialProjections?.year1 ?? [], context),
      year2: sanitiseList(content.financialProjections?.year2 ?? [], context),
      year3: sanitiseList(content.financialProjections?.year3 ?? [], context),
    },
    grantApplicationDraft: (content.grantApplicationDraft ?? []).map((item) => ({
      question: sanitiseText(item.question, context),
      answer: sanitiseText(item.answer, context),
    })).filter((item) => item.question && item.answer),
    budgetNarrative: sanitiseText(content.budgetNarrative, context),
    impactMeasurementPlan: sanitiseText(content.impactMeasurementPlan, context),
    projectWorkplan: (content.projectWorkplan ?? []).map((phase) => ({
      phase: sanitiseText(phase.phase, context),
      timeline: sanitiseText(phase.timeline, context),
      activities: sanitiseList(phase.activities ?? [], context),
      outputs: sanitiseList(phase.outputs ?? [], context),
    })).filter((phase) => phase.phase),
    supportLetterTemplate: sanitiseText(content.supportLetterTemplate, context),
    founderPositioning: sanitiseText(content.founderPositioning, context),
    scalabilityPlan: sanitiseText(content.scalabilityPlan, context),
    riskMitigation: (content.riskMitigation ?? []).map((item) => ({
      risk: sanitiseText(item.risk, context),
      mitigation: sanitiseText(item.mitigation, context),
    })).filter((item) => item.risk && item.mitigation),
    evidenceChecklist: sanitiseList(content.evidenceChecklist ?? [], context),
    nextSteps: sanitiseList(content.nextSteps ?? [], context),
    disclaimer: sanitiseText(content.disclaimer, context),
  };
}

function emptyBusinessModelCanvas(): BusinessModelCanvas {
  return {
    keyPartners: [],
    keyActivities: [],
    keyResources: [],
    valuePropositions: [],
    customerRelationships: [],
    channels: [],
    customerSegments: [],
    costStructure: [],
    revenueStreams: [],
  };
}

function emptyFounderPackContent(disclaimer?: string): FounderPackContent {
  return {
    executiveSummary: "",
    businessPlan: "",
    pitchDeck: [],
    businessModelCanvas: emptyBusinessModelCanvas(),
    innovationStatement: "",
    marketAnalysis: "",
    financialProjections: {
      assumptions: [],
      year1: [],
      year2: [],
      year3: [],
    },
    grantApplicationDraft: [],
    budgetNarrative: "",
    impactMeasurementPlan: "",
    projectWorkplan: [],
    supportLetterTemplate: "",
    founderPositioning: "",
    scalabilityPlan: "",
    riskMitigation: [],
    evidenceChecklist: [],
    nextSteps: [],
    disclaimer:
      disclaimer ||
      "This pack is a business planning aid and is not immigration, legal, financial, or endorsement advice.",
  };
}

function filterFounderPackContent(
  content: FounderPackContent,
  selectedTypes: FounderPackDocumentType[]
): FounderPackContent {
  const allowed = new Set(selectedTypes);
  const filtered = emptyFounderPackContent(content.disclaimer);

  if (allowed.has("executive_summary")) filtered.executiveSummary = content.executiveSummary;
  if (allowed.has("business_plan")) filtered.businessPlan = content.businessPlan;
  if (allowed.has("pitch_deck")) filtered.pitchDeck = content.pitchDeck;
  if (allowed.has("business_model_canvas")) filtered.businessModelCanvas = content.businessModelCanvas;
  if (allowed.has("innovation_statement")) filtered.innovationStatement = content.innovationStatement;
  if (allowed.has("market_analysis")) filtered.marketAnalysis = content.marketAnalysis;
  if (allowed.has("financial_projections")) filtered.financialProjections = content.financialProjections;
  if (allowed.has("grant_application_draft")) filtered.grantApplicationDraft = content.grantApplicationDraft;
  if (allowed.has("budget_narrative")) filtered.budgetNarrative = content.budgetNarrative;
  if (allowed.has("impact_measurement_plan")) filtered.impactMeasurementPlan = content.impactMeasurementPlan;
  if (allowed.has("project_workplan")) filtered.projectWorkplan = content.projectWorkplan;
  if (allowed.has("support_letter_template")) filtered.supportLetterTemplate = content.supportLetterTemplate;
  if (allowed.has("founder_positioning")) filtered.founderPositioning = content.founderPositioning;
  if (allowed.has("scalability_plan")) filtered.scalabilityPlan = content.scalabilityPlan;
  if (allowed.has("risk_mitigation")) filtered.riskMitigation = content.riskMitigation;
  if (allowed.has("evidence_checklist")) filtered.evidenceChecklist = content.evidenceChecklist;
  if (allowed.has("next_steps")) filtered.nextSteps = content.nextSteps;

  return filtered;
}

function parseFounderPackResponse(raw: string): FounderPackContent {
  return normaliseContent(JSON.parse(cleanJsonResponse(raw)) as unknown);
}

function normaliseConfidence(value: unknown): FounderPackAnswerConfidence {
  const textValue = String(value ?? "").toLowerCase();
  if (textValue === "high" || textValue === "medium" || textValue === "low") return textValue;
  return "medium";
}

function normaliseEvidenceStrength(value: unknown): FounderPackEvidenceStrength {
  const textValue = String(value ?? "").toLowerCase();
  if (textValue === "strong" || textValue === "medium" || textValue === "weak") return textValue;
  return "medium";
}

function normaliseQuestionAssistantAnswers(
  raw: unknown,
  questions: FounderPackQuestionInput[],
  context: FounderPackSanitiseContext
): FounderPackQuestionAnswer[] {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rows = Array.isArray(data.answers) ? data.answers : [];
  const fallbackQuestions = questions.map((item) => item.question.trim()).filter(Boolean);

  return rows
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const question = sanitiseText(
        String(row.question ?? fallbackQuestions[index] ?? "").trim(),
        context
      );
      const draftAnswer = sanitiseText(String(row.draftAnswer ?? row.answer ?? "").trim(), context);
      const rationale = sanitiseText(String(row.rationale ?? "").trim(), context);
      if (!question || !draftAnswer) return null;
      return {
        question,
        draftAnswer,
        rationale,
        confidence: normaliseConfidence(row.confidence),
        evidenceStrength: normaliseEvidenceStrength(row.evidenceStrength),
        missingEvidence: sanitiseList(
          Array.isArray(row.missingEvidence) ? row.missingEvidence.map((value) => String(value ?? "")) : [],
          context
        ).slice(0, 8),
        suggestedProfileUpdates: sanitiseList(
          Array.isArray(row.suggestedProfileUpdates)
            ? row.suggestedProfileUpdates.map((value) => String(value ?? ""))
            : [],
          context
        ).slice(0, 8),
        warnings: sanitiseList(
          Array.isArray(row.warnings) ? row.warnings.map((value) => String(value ?? "")) : [],
          context
        ).slice(0, 6),
      } satisfies FounderPackQuestionAnswer;
    })
    .filter((item): item is FounderPackQuestionAnswer => Boolean(item))
    .slice(0, questions.length || 8);
}

function formatQuestionList(questions: FounderPackQuestionInput[]): string {
  return questions
    .map((item, index) => {
      const details = [
        `Question ${index + 1}: ${item.question.trim()}`,
        item.wordLimit ? `Word limit: ${item.wordLimit}` : "",
        item.guidance?.trim() ? `User guidance: ${item.guidance.trim()}` : "",
      ].filter(Boolean);
      return details.join("\n");
    })
    .join("\n\n");
}

export async function generateFounderPackQuestionAnswers(
  profile: BusinessProfileLike,
  inputs: FounderPackQuestionAssistantInputs,
  grantContextBlock?: string
): Promise<{ answers: FounderPackQuestionAnswer[] }> {
  const questions = inputs.questions
    .map((item) => ({
      question: item.question.trim(),
      wordLimit: item.wordLimit,
      guidance: item.guidance?.trim() || undefined,
    }))
    .filter((item) => item.question);

  if (questions.length === 0) {
    throw new Error("Add at least one grant form question.");
  }

  const mode = inputs.outputMode ?? "draft_answer";
  const businessName = text(profile.businessName);
  const context = { businessName };
  const modeInstruction =
    mode === "evidence_check"
      ? "Focus on evidence strength, missing proof, and what the founder should add before answering. Still provide a short draft answer when possible."
      : mode === "improve_existing_answer"
        ? "Improve the existing answer while preserving truthful claims. Explain what changed and what evidence is still weak."
        : "Draft a funder-ready answer that is specific, concise, and usable in a grant form.";

  const prompt = `You are GrantsCopilot's AI Grant Question Assistant. You help founders answer real grant application questions using their Business DNA and selected grant context.

Business profile:
${buildFounderPackProfileContext(profile)}

Selected grant, application, eligibility, and pasted funder context:
${grantContextBlock?.trim() ? grantContextBlock.trim() : "No selected grant context. Use the Business DNA and any pasted criteria only."}

Mode:
${mode}
${modeInstruction}

Existing answer to improve, if supplied:
${inputs.existingAnswer?.trim() ? inputs.existingAnswer.trim() : "None"}

Questions:
${formatQuestionList(questions)}

Rules:
- Write in polished UK business English.
- Never invent customers, awards, revenue, partnerships, accreditations, patents, or funding history.
- If evidence is missing, use cautious language and list the missing proof.
- Respect each word limit if provided.
- Tie the answer to the selected grant criteria, funder objectives, region, applicant type, impact goals, and eligibility gaps when available.
- Do not claim funding is guaranteed or give a probability of success.
- Return answer copy that can be pasted into a funder form, not a generic explanation.

Return ONLY valid JSON with this exact shape:
{
  "answers": [
    {
      "question": "original question",
      "draftAnswer": "editable funder-ready answer",
      "rationale": "why the answer is positioned this way",
      "confidence": "high | medium | low",
      "evidenceStrength": "strong | medium | weak",
      "missingEvidence": ["specific evidence gap"],
      "suggestedProfileUpdates": ["specific Business DNA improvement"],
      "warnings": ["truthfulness, eligibility, deadline, or evidence caution"]
    }
  ]
}`;

  const maxTokens = Math.min(7000, 1800 + questions.length * 850);

  try {
    const raw = await completeJson(prompt, maxTokens);
    const answers = normaliseQuestionAssistantAnswers(
      JSON.parse(cleanJsonResponse(raw)) as unknown,
      questions,
      context
    );
    if (answers.length > 0) return { answers };
  } catch (err) {
    console.warn("[founder-pack-question-assistant] Initial JSON generation failed, retrying", err);
  }

  const retryPrompt = `${prompt}

The previous response was invalid or empty. Regenerate concise valid JSON only.
Keep each draft answer under the requested word limit, or under 220 words where no limit is supplied.`;
  const raw = await completeJson(retryPrompt, Math.min(5000, maxTokens));
  const answers = normaliseQuestionAssistantAnswers(
    JSON.parse(cleanJsonResponse(raw)) as unknown,
    questions,
    context
  );
  if (answers.length === 0) {
    throw new Error("The AI could not return usable question answers. Add more grant context and try again.");
  }
  return { answers };
}

export async function generateFounderPack(
  profile: BusinessProfileLike,
  inputs: FounderPackInputs,
  grantContextBlock?: string
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

Target grants & funder requirements (tailor grant drafts, evidence checklist, budget narrative, workplan, and impact language to these when provided; name grants explicitly where helpful):
${grantContextBlock?.trim() ? grantContextBlock.trim() : "None specified — use strong general UK funding / accelerator readiness framing aligned to the profile."}

Rules when grant context exists:
- Reflect eligibility themes, geographic scope, applicant types, and stated objectives without inventing facts not in the profile or inputs.
- Prioritise overlap between company DNA and each grant's eligibility text.
- Every selected deliverable must clearly change around the selected grant context. Name the selected grant/funder in the executive summary, pitch deck, business plan, or grant draft where appropriate.
- Do not produce a reusable generic company pack when a target grant is provided. Use the grant's stated objectives, applicant type, eligibility language, funding purpose, region, and assessment gaps to shape the output.
- Flag gaps between profile evidence and grant requirements only when evidenceChecklist or risk_mitigation is selected.

Generate these document sections only. For unselected sections, return an empty string or empty array while preserving the required JSON shape:
${selectedLabels}

Treat every selected document type as a complete standalone deliverable, not a short section inside a generic pack. If only one document type is selected, make that one document comprehensive enough to export alone. If multiple related types are selected, make them consistent with each other but avoid repeating the same paragraph across documents.
When selected grants or applications are supplied, explicitly tailor the grant application draft, budget narrative, workplan, impact plan, evidence checklist, pitch deck, and business plan to those grant objectives, eligibility criteria, applicant type, region, and assessment language.
Never populate riskMitigation, evidenceChecklist, or nextSteps unless those exact document types are selected. Do not hide generic risks, evidence items, or next actions inside another section unless they are directly required by the selected document type.

Write in polished UK business English. Be specific to this company. Do not invent exact revenue, customers, contracts, awards, grants, patents, or endorsements unless present in the profile or inputs. Where evidence is missing, use cautious planning language and add the missing evidence to the checklist.
Never use mock, demo, or placeholder company details. Do not mention placeholder businesses such as TalkWeb, Acme, Example Company, Sample Company, Demo Company, or Test Company. Use only the supplied business profile, founder inputs, and grant context. If a detail is missing, write "To be confirmed" or frame it as a planning assumption.
For the Canvas Standard Pitch Deck, make pitchDeck the primary output: create 10-12 practical slides with concise slide copy, speaker notes, and visual direction suitable for a clean Canva-style deck. It must read as a slide deck, not a report. If grant context is provided, include at least 3 slides that explicitly connect the company to the selected grant's criteria, use of funds, delivery plan, or impact priorities. Do not generate image URLs.
For grant application documents, write editable funder-ready drafts that cover the problem, project, beneficiaries, delivery, impact, value for money, risks, and evidence needs.

Return ONLY valid JSON with this exact shape:
{
  "executiveSummary": "section text",
  "businessPlan": "section text with business model, product, operations, go-to-market, and milestones",
  "pitchDeck": [
    {
      "title": "slide title",
      "objective": "what this slide must prove",
      "bullets": ["short slide bullet"],
      "speakerNotes": "presenter notes",
      "visualDirection": "Canva-style layout, chart, icon, or visual direction"
    }
  ],
  "businessModelCanvas": {
    "keyPartners": ["partner"],
    "keyActivities": ["activity"],
    "keyResources": ["resource"],
    "valuePropositions": ["value proposition"],
    "customerRelationships": ["relationship"],
    "channels": ["channel"],
    "customerSegments": ["segment"],
    "costStructure": ["cost"],
    "revenueStreams": ["revenue stream"]
  },
  "innovationStatement": "section text",
  "marketAnalysis": "section text",
  "financialProjections": {
    "assumptions": ["assumption"],
    "year1": ["revenue/cost/milestone line"],
    "year2": ["revenue/cost/milestone line"],
    "year3": ["revenue/cost/milestone line"]
  },
  "grantApplicationDraft": [{ "question": "grant application question", "answer": "draft answer" }],
  "budgetNarrative": "section text explaining eligible costs, funding use, match funding if relevant, and value for money",
  "impactMeasurementPlan": "section text covering outputs, outcomes, KPIs, beneficiaries, reporting, and evidence collection",
  "projectWorkplan": [{ "phase": "phase name", "timeline": "timeline", "activities": ["activity"], "outputs": ["output"] }],
  "supportLetterTemplate": "editable support letter template for a partner, customer, council, incubator, or referee",
  "founderPositioning": "section text positioning the founder as a key technical/commercial founder",
  "scalabilityPlan": "section text covering UK, international growth, hiring, partnerships, and repeatable distribution",
  "riskMitigation": [{ "risk": "risk", "mitigation": "mitigation" }],
  "evidenceChecklist": ["document or evidence needed"],
  "nextSteps": ["action"],
  "disclaimer": "short disclaimer"
}`;

  const maxTokens =
    selectedTypes.length <= 1 ? 7000 : selectedTypes.length <= 4 ? 10000 : 14000;

  try {
    const raw = await completeJson(prompt, maxTokens);
    const content = filterFounderPackContent(parseFounderPackResponse(raw), selectedTypes);
    return sanitiseFounderPackContent(content, {
      businessName: text(profile.businessName),
      founderName: inputs.founderName,
      founderRole: inputs.founderRole,
    });
  } catch (err) {
    console.warn("[founder-pack] Initial JSON generation failed, retrying with stricter output limits", err);
  }

  const retryPrompt = `${prompt}

The previous response was invalid or truncated. Regenerate the same selected deliverables as COMPLETE valid JSON only.
Keep every selected deliverable useful and standalone, but make the text more concise so the JSON is not cut off:
- Long text sections: 4-7 focused paragraphs maximum.
- Pitch deck: 10 slides maximum, 3-5 bullets per slide.
- Grant application draft: 5-8 strong Q&A pairs maximum.
- Workplan: 4 phases maximum.
- Risk mitigation: 5 risks maximum.
- Evidence checklist and next steps: 8 items maximum.
Do not include markdown fences or commentary.`;

  try {
    const raw = await completeJson(retryPrompt, maxTokens);
    const content = filterFounderPackContent(parseFounderPackResponse(raw), selectedTypes);
    return sanitiseFounderPackContent(content, {
      businessName: text(profile.businessName),
      founderName: inputs.founderName,
      founderRole: inputs.founderRole,
    });
  } catch (err) {
    console.error("[founder-pack] Retry JSON generation failed", err);
    throw new Error("The AI response was too long to save as structured JSON. Select fewer document types or use a quick preset, then try again.");
  }
}
