import { resolveGrantFundingValue, type GrantValueInput } from "@/lib/grant-value";
export type SocialContentGrant = GrantValueInput & {
  name: string; funder: string | null; deadline: string | null;
  eligibility?: string | null; description?: string | null; objectives?: string | null;
  currency?: string | null; regions?: string[] | null; sectors?: string[] | null; applicantTypes?: string[] | null;
};
export function socialExcerpt(value: string | null | undefined, limit: number) {
  const text = (value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text.length <= limit ? text : text.slice(0, limit - 1).trimEnd() + "…";
}
export const GRANTSCOPILOT_SOCIAL_HELP = "Check your business fit, spot missing evidence and prepare grant answers with GrantsCopilot.";
export function deadlineSocialContent(grant: SocialContentGrant) {
  const funding = resolveGrantFundingValue(grant);
  const currency = funding.currency;
  const amount = funding.amount == null ? null : `${currency ? `${currency} ` : "Currency not stated · "}${funding.amount.toLocaleString("en-GB")}`;
  const award = amount ? `${funding.label}: ${amount}` : "Award amount not stated — check funder details";
  const audience = grant.applicantTypes?.filter(Boolean).join(", ");
  const geography = grant.regions?.filter(Boolean).join(", ");
  const sector = grant.sectors?.filter(Boolean).join(", ");
  const who = [audience ? `Applicants: ${audience}` : "", geography ? `Location: ${geography}` : "", sector ? `Focus: ${sector}` : "", grant.eligibility ?? ""].filter(Boolean).join(". ");
  return { award, whoQualifies: who || "Applicant criteria not recorded — check the funder's eligibility requirements.", help: GRANTSCOPILOT_SOCIAL_HELP };
}
