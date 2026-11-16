/** GrantsCopilot's editorial checklist, not an official funder rubric or scoring model. */
export const DEFAULT_GRANT_FRAMEWORK_VERSION = 1;
export const DEFAULT_GRANT_FRAMEWORK = [
  { area: "Need and project fit", guidance: "Explain the problem, who experiences it, the proposed project and its connection to the published funding purpose. Confirm scope rather than force-fitting the business." },
  { area: "Approach and differentiation", guidance: "Explain what will be done, why this approach is appropriate and how it differs from alternatives. Discuss technical uncertainty, novelty or R&D only where relevant to this opportunity." },
  { area: "Demand and supporting evidence", guidance: "Use confirmed customer, beneficiary, market or stakeholder evidence. Distinguish achieved results from assumptions and identify the evidence still needed." },
  { area: "Outcomes and impact", guidance: "Describe measurable outputs, intended benefits, beneficiaries and the next milestone. Explain how results will be measured without inventing impact figures." },
  { area: "Delivery and capability", guidance: "Set out proportionate activities, milestones, responsibilities, skills and partner commitments. Mark unconfirmed people, dates and resources clearly." },
  { area: "Costs and funding rationale", guidance: "Explain the requested funding, itemised costs, value for money and any confirmed contribution. Discuss additionality where relevant; never invent co-funding or impose a generic funding threshold." },
  { area: "Risks, compliance and evidence gaps", guidance: "Identify material delivery risks and mitigations. Ask focused clarification questions about missing evidence, IP, permissions or commitments where relevant. Flag declarations for applicant confirmation." },
] as const;
export function defaultGrantFrameworkContext() {
  return `GRANTSCOPILOT DEFAULT PREPARATION FRAMEWORK v${DEFAULT_GRANT_FRAMEWORK_VERSION} — advisory checklist only; not official Innovate UK guidance, a verified funder rubric, eligibility requirements, assessor scoring or an award probability. No applicable structured assessor criteria have been verified for this context; that may reflect missing, unreadable or unreviewed guidance, not absence of a published framework. Use the following areas only where relevant to the actual application questions. Published requirements, word limits, exclusions and verified competition-specific assessment criteria always take precedence. Do not add extra mandatory conditions, scores, weights or pass thresholds. For each relevant question draft from supported facts, identify missing evidence and ask focused clarification questions.\n${DEFAULT_GRANT_FRAMEWORK.map(row=>`${row.area}: ${row.guidance}`).join("\n")}`;
}
