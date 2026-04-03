/**
 * Document categories for grant matching, grouped by section.
 * Safe to import in client components (no server-only deps).
 */

export interface DocumentCategoryItem {
  value: string;
  label: string;
  group: string;
}

export const DOCUMENT_CATEGORY_GROUPS = [
  "Business & Company",
  "Financial",
  "Project & Grant-Specific",
  "Technical & Product",
  "Team & HR",
  "Legal & Compliance",
  "Impact & ESG",
  "Partnerships & Support",
  "Media & Presentations",
  "Traction & Performance",
  "Government & Registration",
  "Identity & Verification",
  "Other",
] as const;

export type DocumentCategoryGroup = (typeof DOCUMENT_CATEGORY_GROUPS)[number];

export const DOCUMENT_CATEGORIES: readonly DocumentCategoryItem[] = [
  // ── Business & Company ──
  { value: "business_plan", label: "Business plan", group: "Business & Company" },
  { value: "executive_summary", label: "Executive summary", group: "Business & Company" },
  { value: "company_profile", label: "Company profile / overview", group: "Business & Company" },
  { value: "certificate_of_incorporation", label: "Certificate of incorporation", group: "Business & Company" },
  { value: "articles_of_association", label: "Articles of association / bylaws", group: "Business & Company" },
  { value: "business_registration", label: "Business registration certificate", group: "Business & Company" },
  { value: "shareholder_structure", label: "Shareholder structure / cap table", group: "Business & Company" },
  { value: "org_chart", label: "Organisational chart", group: "Business & Company" },
  { value: "board_of_directors", label: "Board of directors information", group: "Business & Company" },

  // ── Financial ──
  { value: "financial_statement", label: "Financial statements / accounts", group: "Financial" },
  { value: "audited_accounts", label: "Audited accounts", group: "Financial" },
  { value: "management_accounts", label: "Management accounts", group: "Financial" },
  { value: "profit_and_loss", label: "Profit & loss statement", group: "Financial" },
  { value: "balance_sheet", label: "Balance sheet", group: "Financial" },
  { value: "cash_flow_forecast", label: "Cash flow forecast / projection", group: "Financial" },
  { value: "bank_statement", label: "Bank statements", group: "Financial" },
  { value: "tax_return", label: "Tax return / filing", group: "Financial" },
  { value: "budget", label: "Budget / cost breakdown", group: "Financial" },
  { value: "financial_projections", label: "Financial projections", group: "Financial" },
  { value: "funding_history", label: "Funding history / investment summary", group: "Financial" },

  // ── Project & Grant-Specific ──
  { value: "project_proposal", label: "Project proposal / plan", group: "Project & Grant-Specific" },
  { value: "work_plan", label: "Work plan / timeline / Gantt chart", group: "Project & Grant-Specific" },
  { value: "statement_of_work", label: "Statement of work (SOW)", group: "Project & Grant-Specific" },
  { value: "milestones_deliverables", label: "Milestones & deliverables", group: "Project & Grant-Specific" },
  { value: "logic_model", label: "Logic model / theory of change", group: "Project & Grant-Specific" },
  { value: "risk_register", label: "Risk register / mitigation plan", group: "Project & Grant-Specific" },
  { value: "monitoring_evaluation", label: "Monitoring & evaluation framework", group: "Project & Grant-Specific" },
  { value: "sustainability_plan", label: "Sustainability / exit strategy", group: "Project & Grant-Specific" },
  { value: "innovation_description", label: "Innovation description", group: "Project & Grant-Specific" },
  { value: "technical_methodology", label: "Technical methodology", group: "Project & Grant-Specific" },

  // ── Technical & Product ──
  { value: "technical_architecture", label: "Technical architecture / specs", group: "Technical & Product" },
  { value: "product_documentation", label: "Product documentation", group: "Technical & Product" },
  { value: "mvp_prototype", label: "MVP / prototype description", group: "Technical & Product" },
  { value: "research_paper", label: "Research paper / publication", group: "Technical & Product" },
  { value: "feasibility_study", label: "Feasibility study / market research", group: "Technical & Product" },
  { value: "ip_documentation", label: "IP / patent documentation", group: "Technical & Product" },
  { value: "data_management_plan", label: "Data management plan", group: "Technical & Product" },

  // ── Team & HR ──
  { value: "cv_resume", label: "CV / résumé (key personnel)", group: "Team & HR" },
  { value: "advisory_board", label: "Advisory board details", group: "Team & HR" },
  { value: "hiring_plan", label: "Hiring plan / recruitment strategy", group: "Team & HR" },
  { value: "employment_structure", label: "Employment structure", group: "Team & HR" },

  // ── Legal & Compliance ──
  { value: "licence_permit", label: "Licence / permit / accreditation", group: "Legal & Compliance" },
  { value: "tax_clearance", label: "Tax clearance / compliance certificate", group: "Legal & Compliance" },
  { value: "insurance_certificate", label: "Insurance certificate", group: "Legal & Compliance" },
  { value: "data_protection", label: "GDPR / data protection policy", group: "Legal & Compliance" },
  { value: "equality_policy", label: "Equality, diversity & inclusion policy", group: "Legal & Compliance" },
  { value: "safeguarding_policy", label: "Safeguarding policy", group: "Legal & Compliance" },
  { value: "anti_fraud_aml", label: "Anti-fraud / AML / KYC policy", group: "Legal & Compliance" },
  { value: "good_standing", label: "Certificate of good standing", group: "Legal & Compliance" },

  // ── Impact & ESG ──
  { value: "social_impact_report", label: "Social impact report", group: "Impact & ESG" },
  { value: "environmental_assessment", label: "Environmental impact assessment", group: "Impact & ESG" },
  { value: "esg_report", label: "ESG metrics / report", group: "Impact & ESG" },
  { value: "carbon_reduction_plan", label: "Carbon reduction plan", group: "Impact & ESG" },
  { value: "community_benefit", label: "Community benefit statement", group: "Impact & ESG" },
  { value: "diversity_metrics", label: "D&I metrics / report", group: "Impact & ESG" },

  // ── Partnerships & Support ──
  { value: "letter_of_support", label: "Letter of support / endorsement", group: "Partnerships & Support" },
  { value: "letter_of_intent", label: "Letter of intent (LOI)", group: "Partnerships & Support" },
  { value: "mou_partnership", label: "MOU / partnership agreement", group: "Partnerships & Support" },
  { value: "testimonials_case_studies", label: "Client testimonials / case studies", group: "Partnerships & Support" },
  { value: "quotation", label: "Quotation / supplier estimate", group: "Partnerships & Support" },

  // ── Media & Presentations ──
  { value: "pitch_deck", label: "Pitch deck / presentation", group: "Media & Presentations" },
  { value: "pitch_video", label: "Pitch / explainer video", group: "Media & Presentations" },
  { value: "demo_video", label: "Product demo video", group: "Media & Presentations" },
  { value: "visual_evidence", label: "Photos / screenshots / visual evidence", group: "Media & Presentations" },
  { value: "marketing_materials", label: "Marketing materials", group: "Media & Presentations" },

  // ── Traction & Performance ──
  { value: "revenue_report", label: "Revenue / growth report", group: "Traction & Performance" },
  { value: "user_metrics", label: "User metrics / KPI data", group: "Traction & Performance" },
  { value: "pilot_results", label: "Pilot results / case study", group: "Traction & Performance" },
  { value: "customer_acquisition", label: "Customer acquisition data", group: "Traction & Performance" },

  // ── Government & Registration ──
  { value: "vat_tax_id", label: "VAT / tax ID registration", group: "Government & Registration" },
  { value: "duns_sam", label: "DUNS / SAM registration (US)", group: "Government & Registration" },
  { value: "charity_registration", label: "Charity / nonprofit registration", group: "Government & Registration" },
  { value: "procurement_eligibility", label: "Public procurement eligibility docs", group: "Government & Registration" },

  // ── Identity & Verification ──
  { value: "founder_director_id", label: "Founder / director ID", group: "Identity & Verification" },
  { value: "proof_of_address", label: "Proof of address", group: "Identity & Verification" },
  { value: "company_address_verification", label: "Company address verification", group: "Identity & Verification" },

  // ── Other ──
  { value: "other", label: "Other", group: "Other" },
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number]["value"];

/** Group categories for rendering in <optgroup> dropdowns. */
export function getGroupedCategories(): Map<string, readonly DocumentCategoryItem[]> {
  const map = new Map<string, DocumentCategoryItem[]>();
  for (const cat of DOCUMENT_CATEGORIES) {
    const group = map.get(cat.group) ?? [];
    group.push(cat);
    map.set(cat.group, group);
  }
  return map;
}
