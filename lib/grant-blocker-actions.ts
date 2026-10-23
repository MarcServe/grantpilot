export type GrantBlockerAction = { label: string; href: string };
const PROFILE_ACTIONS: Array<{ match: RegExp; field: string; step: number; label: string }> = [
  { match: /incorporat|company age|year established|establishment date/i, field: "incorporationDate", step: 1, label: "Confirm incorporation date" },
  { match: /trading (start|date|history)|years? (of )?trading/i, field: "tradingStartDate", step: 1, label: "Confirm trading start date" },
  { match: /legal (structure|status|form)|registered (company|charity)|organisation type/i, field: "legalStructure", step: 1, label: "Confirm legal structure" },
  { match: /employee|headcount|staff count/i, field: "employeeCount", step: 1, label: "Add employee count" },
  { match: /annual revenue|turnover|revenue (missing|not|unknown)/i, field: "annualRevenue", step: 3, label: "Confirm annual revenue" },
  { match: /co.?fund|match.?fund|own contribution/i, field: "coFundingCapacity", step: 4, label: "Confirm co-funding capacity" },
  { match: /reimburse|upfront (cost|payment)|pay.*up.?front/i, field: "reimbursementReadiness", step: 4, label: "Confirm reimbursement readiness" },
  { match: /business (stage|maturity)/i, field: "businessStage", step: 1, label: "Confirm business stage" },
  { match: /business size|size band|sme status/i, field: "businessSizeBand", step: 1, label: "Confirm business size" },
  { match: /local authority|council area/i, field: "localAuthority", step: 1, label: "Confirm local authority" },
  { match: /location|postcode|geograph|region/i, field: "location", step: 1, label: "Review business location" },
  { match: /sector|industry/i, field: "sector", step: 2, label: "Review business sector" },
  { match: /grant (experience|history)|previous grant/i, field: "previousGrantExperience", step: 3, label: "Confirm grant experience" },
  { match: /document|upload|accounts|supporting evidence/i, field: "documents", step: 5, label: "Add supporting documents" },
  { match: /eligibility fact|verified fact/i, field: "eligibilityFacts", step: 7, label: "Confirm eligibility facts" },
];
export function grantBlockerAction(text: string, grantId: string, currentProfile?: Record<string, unknown>): GrantBlockerAction {
  const grant = encodeURIComponent(grantId);
  // Funder dates and application routes belong to the grant, not company dates.
  if (/deadline|funder page|application (route|link)|direct (form|application)/i.test(text)) {
    return { label: "Review funder requirements", href: `/grants/${grant}?from=matches#verify` };
  }
  const profile = PROFILE_ACTIONS.find((item) => item.match.test(text));
  if (profile) {
    const supplied = currentProfile?.[profile.field];
    const ageSupplied = profile.field === "incorporationDate" && currentProfile?.yearEstablished != null;
    if ((supplied != null && String(supplied).trim() !== "") || ageSupplied) {
      return { label: "Review grant requirement", href: `/grants/${grant}?from=matches#verify` };
    }
    const params = new URLSearchParams({ step: String(profile.step), field: profile.field, grantId });
    return { label: profile.label, href: `/profile?${params}` };
  }
  if (/question|answer|start.*application|prepare.*application/i.test(text)) return { label: "Prepare grant answers", href: `/grant-assistant?grantId=${grant}` };
  if (/budget|workplan|project plan|founder pack/i.test(text)) return { label: "Prepare application pack", href: `/founder-pack?grantId=${grant}` };
  return { label: "Review grant requirements", href: `/grants/${grant}?from=matches#verify` };
}
