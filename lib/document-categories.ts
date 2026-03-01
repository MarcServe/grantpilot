/**
 * Document categories for grant matching. Safe to import in client components
 * (no Anthropic or other server-only deps).
 */
export const DOCUMENT_CATEGORIES = [
  { value: "pitch_video", label: "Pitch / explainer video" },
  { value: "financial_statement", label: "Financial statement / accounts" },
  { value: "business_plan", label: "Business plan" },
  { value: "company_profile", label: "Company profile" },
  { value: "other", label: "Other" },
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number]["value"];
