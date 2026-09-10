export function profileToMatching(profile: Record<string, unknown>) {
  const get = (key: string) =>
    profile[key] ?? profile[key.replace(/([A-Z])/g, "_$1").toLowerCase()];
  return {
    businessName: String(get("businessName") ?? ""),
    sector: String(get("sector") ?? ""),
    missionStatement: String(get("missionStatement") ?? ""),
    description: String(get("description") ?? ""),
    location: String(get("location") ?? ""),
    employeeCount:
      profile.employeeCount != null
        ? Number(profile.employeeCount)
        : profile.employee_count != null
          ? Number(profile.employee_count)
          : null,
    annualRevenue:
      profile.annualRevenue != null
        ? Number(profile.annualRevenue)
        : profile.annual_revenue != null
          ? Number(profile.annual_revenue)
          : null,
    yearEstablished:
      profile.yearEstablished != null
        ? Number(profile.yearEstablished)
        : profile.year_established != null
          ? Number(profile.year_established)
          : null,
    incorporationDate:
      get("incorporationDate") != null
        ? String(get("incorporationDate"))
        : null,
    tradingStartDate:
      get("tradingStartDate") != null ? String(get("tradingStartDate")) : null,
    expectedEmployeeGrowth:
      get("expectedEmployeeGrowth") != null
        ? String(get("expectedEmployeeGrowth"))
        : null,
    fundingMin: Number(get("fundingMin") ?? get("funding_min") ?? 0),
    fundingMax: Number(get("fundingMax") ?? get("funding_max") ?? 0),
    fundingPurposes: Array.isArray(profile.fundingPurposes)
      ? (profile.fundingPurposes as string[])
      : Array.isArray(profile.funding_purposes)
        ? (profile.funding_purposes as string[])
        : [],
    preferredOpportunityTypes: Array.isArray(get("preferredOpportunityTypes"))
      ? (get("preferredOpportunityTypes") as string[])
      : [],
    fundingDetails:
      profile.fundingDetails != null
        ? String(profile.fundingDetails)
        : profile.funding_details != null
          ? String(profile.funding_details)
          : null,
    fundingUrgency:
      get("fundingUrgency") != null ? String(get("fundingUrgency")) : null,
    fundingPosition:
      get("fundingPosition") != null ? String(get("fundingPosition")) : null,
    documentReadiness:
      get("documentReadiness") != null
        ? String(get("documentReadiness"))
        : null,
    businessType: String(get("businessType") ?? get("business_type") ?? ""),
    legalStructure: String(get("legalStructure") ?? ""),
    businessStage: String(get("businessStage") ?? ""),
    businessSizeBand: String(get("businessSizeBand") ?? ""),
    founderEmploymentStatus: String(get("founderEmploymentStatus") ?? ""),
    localAuthority: String(get("localAuthority") ?? ""),
    areasServed: String(get("areasServed") ?? ""),
    coFundingCapacity: String(get("coFundingCapacity") ?? ""),
    reimbursementReadiness: String(get("reimbursementReadiness") ?? ""),
    coFundingAvailable:
      get("coFundingAvailable") != null
        ? String(get("coFundingAvailable"))
        : null,
    matchFundingDetails:
      get("matchFundingDetails") != null
        ? String(get("matchFundingDetails"))
        : null,
    previousGrantExperience:
      get("previousGrantExperience") != null
        ? String(get("previousGrantExperience"))
        : null,
    previousGrantHistory:
      get("previousGrantHistory") != null
        ? String(get("previousGrantHistory"))
        : null,
    fundingOutcomeSignals:
      profile.fundingOutcomeSignals != null
        ? String(profile.fundingOutcomeSignals)
        : null,
    eligibilityFacts: get("eligibilityFacts") ?? get("eligibility_facts") ?? [],
  };
}
