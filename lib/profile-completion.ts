export type CompletionField = {
  key: string;
  label: string;
  step: number;
  complete: boolean;
};
const fields: [string, string, number][] = [
  ["businessName", "Business name", 1],
  ["legalStructure", "Legal structure", 1],
  ["businessStage", "Business stage", 1],
  ["businessSizeBand", "Business size", 1],
  ["employeeCount", "Employee count", 1],
  ["location", "Location", 1],
  ["sector", "Sector", 2],
  ["description", "Business description", 2],
  ["missionStatement", "Mission", 2],
  ["annualRevenue", "Annual revenue", 3],
  ["previousGrantExperience", "Previous grant experience", 3],
  ["fundingPurposes", "Funding purposes", 4],
  ["fundingDetails", "Funding use", 4],
  ["coFundingCapacity", "Co-funding position", 4],
  ["documentReadiness", "Document readiness", 4],
  ["projectSummary", "Project summary", 6],
];
export function profileCompletionFields(
  profile: Record<string, unknown>,
): CompletionField[] {
  const applicable = [...fields];
  if (
    /limited|charity|community interest|partnership/i.test(
      String(profile.legalStructure ?? ""),
    )
  )
    applicable.push(["incorporationDate", "Incorporation date", 1]);
  if (
    !/idea|pre-trading|pre-revenue/i.test(String(profile.businessStage ?? ""))
  )
    applicable.push(["tradingStartDate", "Trading start date", 1]);
  return applicable.map(([key, label, step]) => {
    const value = profile[key];
    return {
      key,
      label,
      step,
      complete:
        value != null &&
        (Array.isArray(value)
          ? value.length > 0
          : String(value).trim().length > 0 &&
            !/^not sure$/i.test(String(value))),
    };
  });
}
export function firstIncompleteProfileStep(profile: Record<string, unknown>) {
  return profileCompletionFields(profile).find((f) => !f.complete)?.step ?? 1;
}

export function criteriaProfileCompletionScore(
  profile: Record<string, unknown>,
): number {
  const fields = profileCompletionFields(profile);
  return Math.round(
    (100 * fields.filter((f) => f.complete).length) / fields.length,
  );
}
