import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * One required attachment for a grant (video or document with optional constraints).
 */
export interface RequiredAttachment {
  kind: "video" | "document";
  label: string;
  /** Suggested category for matching user documents: pitch_video, financial_statement, etc. */
  categoryHint?: string;
  /** Max duration in minutes (for video). */
  maxDurationMinutes?: number;
  /** Max file size in MB. */
  maxSizeMB?: number;
  /** MIME accept hint for documents, e.g. application/pdf, video/*. */
  accept?: string;
}

/**
 * Parse grant eligibility/description text to extract required attachments
 * (e.g. "pitch video max 5 minutes, 50MB", "upload financial statement PDF").
 */
export async function parseRequiredAttachmentsFromText(
  text: string
): Promise<RequiredAttachment[]> {
  if (!text?.trim()) return [];

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Extract required uploads/attachments from this grant text. Focus on:
- Video requirements (e.g. "pitch video", "5 minute video", "max 50MB video")
- Document requirements (e.g. "financial statement", "business plan PDF", "accounts", "project proposal", "CVs")

Grant text:
${text.slice(0, 8000)}

Return ONLY a JSON array. Each item:
{ "kind": "video" or "document", "label": "short label", "categoryHint": "<value>", "maxDurationMinutes": number or omit, "maxSizeMB": number or omit, "accept": "video/*" or "application/pdf" or omit }

Valid categoryHint values:
Business: business_plan, executive_summary, company_profile, certificate_of_incorporation, articles_of_association, business_registration, shareholder_structure, org_chart, board_of_directors
Financial: financial_statement, audited_accounts, management_accounts, profit_and_loss, balance_sheet, cash_flow_forecast, bank_statement, tax_return, budget, financial_projections, funding_history
Project: project_proposal, work_plan, statement_of_work, milestones_deliverables, logic_model, risk_register, monitoring_evaluation, sustainability_plan, innovation_description, technical_methodology
Technical: technical_architecture, product_documentation, mvp_prototype, research_paper, feasibility_study, ip_documentation, data_management_plan
Team: cv_resume, advisory_board, hiring_plan, employment_structure
Legal: licence_permit, tax_clearance, insurance_certificate, data_protection, equality_policy, safeguarding_policy, anti_fraud_aml, good_standing
Impact: social_impact_report, environmental_assessment, esg_report, carbon_reduction_plan, community_benefit, diversity_metrics
Partners: letter_of_support, letter_of_intent, mou_partnership, testimonials_case_studies, quotation
Media: pitch_deck, pitch_video, demo_video, visual_evidence, marketing_materials
Traction: revenue_report, user_metrics, pilot_results, customer_acquisition
Gov: vat_tax_id, duns_sam, charity_registration, procurement_eligibility
Identity: founder_director_id, proof_of_address, company_address_verification
Fallback: other

If no clear requirements found, return []. Do not invent requirements.`,
      },
    ],
  });

  const raw =
    response.content[0].type === "text" ? response.content[0].text : "";
  const match = raw.match(/\[[\s\S]*\]/);
  const jsonStr = match ? match[0] : raw;

  try {
    const parsed = JSON.parse(jsonStr) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (a): a is RequiredAttachment =>
          a != null &&
          typeof a === "object" &&
          ((a as RequiredAttachment).kind === "video" ||
            (a as RequiredAttachment).kind === "document") &&
          typeof (a as RequiredAttachment).label === "string"
      )
      .map((a) => ({
        kind: a.kind as "video" | "document",
        label: String(a.label),
        categoryHint:
          typeof (a as RequiredAttachment).categoryHint === "string"
            ? (a as RequiredAttachment).categoryHint
            : undefined,
        maxDurationMinutes:
          typeof (a as RequiredAttachment).maxDurationMinutes === "number"
            ? (a as RequiredAttachment).maxDurationMinutes
            : undefined,
        maxSizeMB:
          typeof (a as RequiredAttachment).maxSizeMB === "number"
            ? (a as RequiredAttachment).maxSizeMB
            : undefined,
        accept:
          typeof (a as RequiredAttachment).accept === "string"
            ? (a as RequiredAttachment).accept
            : undefined,
      }));
  } catch {
    return [];
  }
}

export { DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_GROUPS, getGroupedCategories, type DocumentCategory, type DocumentCategoryItem } from "./document-categories";

/**
 * Compare grant required_attachments to user documents (by category and type).
 * Returns { met, missing } for display.
 */
export function checkRequirementsAgainstDocuments(
  required: RequiredAttachment[],
  documents: { category?: string | null; type?: string; name: string }[]
): { met: RequiredAttachment[]; missing: RequiredAttachment[] } {
  const met: RequiredAttachment[] = [];
  const missing: RequiredAttachment[] = [];
  const used = new Set<number>();

  for (const req of required) {
    const hint = req.categoryHint ?? (req.kind === "video" ? "pitch_video" : "other");
    const isVideo = req.kind === "video";
    const found = documents.some((d, i) => {
      if (used.has(i)) return false;
      const cat = d.category ?? "";
      const type = (d.type ?? "").toLowerCase();
      const matchCategory = cat === hint || (hint === "other" && !!cat);
      const matchVideo = isVideo && (type.startsWith("video/") || /\.(mp4|webm|mov)$/i.test(d.name));
      const matchDoc = !isVideo && (matchCategory || type.includes("pdf") || type.includes("document"));
      if ((isVideo && matchVideo) || (!isVideo && (matchCategory || matchDoc))) {
        used.add(i);
        return true;
      }
      return false;
    });
    if (found) met.push(req);
    else missing.push(req);
  }
  return { met, missing };
}
