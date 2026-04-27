import { getSupabase } from "./supabase.js";

export interface ProfileData {
  businessName: string;
  tradingName: string | null;
  registrationNumber: string | null;
  charityNumber: string | null;
  vatNumber: string | null;
  yearEstablished: number | null;
  location: string;
  registeredAddress: string | null;
  operatingAddress: string | null;
  postcode: string | null;
  country: string | null;
  region: string | null;
  primaryContactName: string | null;
  primaryContactRole: string | null;
  primaryContactEmail: string | null;
  primaryContactPhone: string | null;
  primaryContactLinkedIn: string | null;
  preferredContactMethod: string | null;
  sector: string;
  missionStatement: string;
  description: string;
  employeeCount: number | null;
  contractorCount: number | null;
  annualRevenue: number | null;
  profitLoss: string | null;
  cashReserves: string | null;
  financialProjections: string | null;
  previousGrants: string | null;
  fundingMin: number;
  fundingMax: number;
  fundingPurposes: string[];
  fundingDetails: string | null;
  coFundingAvailable: string | null;
  matchFundingDetails: string | null;
  directorNames: string | null;
  directorProfiles: string | null;
  teamMembers: string | null;
  boardMembers: string | null;
  founderBackground: string | null;
  projectTitle: string | null;
  projectSummary: string | null;
  problemStatement: string | null;
  proposedSolution: string | null;
  projectObjectives: string | null;
  expectedOutcomes: string | null;
  projectStartDate: string | null;
  projectEndDate: string | null;
  beneficiaryGroups: string | null;
  beneficiaryCount: number | null;
  geographicImpact: string | null;
  diversityInclusionImpact: string | null;
  jobsCreated: number | null;
  revenueGrowthExpected: string | null;
  co2Reduction: string | null;
  productivityImprovements: string | null;
  milestones: string | null;
  deliverables: string | null;
  partnerOrganisations: string | null;
  collaborationDetails: string | null;
  risksMitigation: string | null;
  exitStrategy: string | null;
  projectSustainabilityPlan: string | null;
  websiteIntelligence: string | null;
  socialImpact: string | null;
  innovationCapabilities: string | null;
  sustainabilityInitiatives: string | null;
  communityEngagement: string | null;
  keyAchievements: string | null;
  teamExpertise: string | null;
  learnedApplicationAnswers: Record<string, string> | null;
}

export interface DocumentData {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
  category?: string | null;
}

function normaliseProfile(row: Record<string, unknown>): ProfileData {
  const get = (key: string) =>
    row[key] ?? row[key.replace(/([A-Z])/g, "_$1").toLowerCase()];
  const str = (key: string): string | null => {
    const value = get(key);
    return value != null && value !== "" ? String(value) : null;
  };
  const num = (key: string): number | null => {
    const value = get(key);
    if (value == null || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  return {
    businessName: String(get("businessName") ?? ""),
    tradingName: str("tradingName"),
    registrationNumber: str("registrationNumber"),
    charityNumber: str("charityNumber"),
    vatNumber: str("vatNumber"),
    yearEstablished: num("yearEstablished"),
    location: String(get("location") ?? ""),
    registeredAddress: str("registeredAddress"),
    operatingAddress: str("operatingAddress"),
    postcode: str("postcode"),
    country: str("country"),
    region: str("region"),
    primaryContactName: str("primaryContactName"),
    primaryContactRole: str("primaryContactRole"),
    primaryContactEmail: str("primaryContactEmail"),
    primaryContactPhone: str("primaryContactPhone"),
    primaryContactLinkedIn: str("primaryContactLinkedIn"),
    preferredContactMethod: str("preferredContactMethod"),
    sector: String(get("sector") ?? ""),
    missionStatement: String(get("missionStatement") ?? get("mission_statement") ?? ""),
    description: String(get("description") ?? ""),
    employeeCount: num("employeeCount"),
    contractorCount: num("contractorCount"),
    annualRevenue: num("annualRevenue"),
    profitLoss: str("profitLoss"),
    cashReserves: str("cashReserves"),
    financialProjections: str("financialProjections"),
    previousGrants: str("previousGrants"),
    fundingMin: Number(get("fundingMin") ?? get("funding_min") ?? 0),
    fundingMax: Number(get("fundingMax") ?? get("funding_max") ?? 0),
    fundingPurposes: Array.isArray(row.fundingPurposes) ? row.fundingPurposes as string[] : (Array.isArray(row.funding_purposes) ? row.funding_purposes as string[] : []),
    fundingDetails: str("fundingDetails"),
    coFundingAvailable: str("coFundingAvailable"),
    matchFundingDetails: str("matchFundingDetails"),
    directorNames: str("directorNames"),
    directorProfiles: str("directorProfiles"),
    teamMembers: str("teamMembers"),
    boardMembers: str("boardMembers"),
    founderBackground: str("founderBackground"),
    projectTitle: str("projectTitle"),
    projectSummary: str("projectSummary"),
    problemStatement: str("problemStatement"),
    proposedSolution: str("proposedSolution"),
    projectObjectives: str("projectObjectives"),
    expectedOutcomes: str("expectedOutcomes"),
    projectStartDate: str("projectStartDate"),
    projectEndDate: str("projectEndDate"),
    beneficiaryGroups: str("beneficiaryGroups"),
    beneficiaryCount: num("beneficiaryCount"),
    geographicImpact: str("geographicImpact"),
    diversityInclusionImpact: str("diversityInclusionImpact"),
    jobsCreated: num("jobsCreated"),
    revenueGrowthExpected: str("revenueGrowthExpected"),
    co2Reduction: str("co2Reduction"),
    productivityImprovements: str("productivityImprovements"),
    milestones: str("milestones"),
    deliverables: str("deliverables"),
    partnerOrganisations: str("partnerOrganisations"),
    collaborationDetails: str("collaborationDetails"),
    risksMitigation: str("risksMitigation"),
    exitStrategy: str("exitStrategy"),
    projectSustainabilityPlan: str("projectSustainabilityPlan"),
    websiteIntelligence: str("websiteIntelligence"),
    socialImpact: str("socialImpact"),
    innovationCapabilities: str("innovationCapabilities"),
    sustainabilityInitiatives: str("sustainabilityInitiatives"),
    communityEngagement: str("communityEngagement"),
    keyAchievements: str("keyAchievements"),
    teamExpertise: str("teamExpertise"),
    learnedApplicationAnswers: null,
  };
}

function normaliseDocument(row: Record<string, unknown>): DocumentData {
  const get = (key: string) =>
    row[key] ?? row[key.replace(/([A-Z])/g, "_$1").toLowerCase()];
  const cat = get("category");
  return {
    id: String(get("id") ?? ""),
    name: String(get("name") ?? ""),
    url: String(get("url") ?? ""),
    type: String(get("type") ?? "application/octet-stream"),
    size: Number(get("size") ?? 0),
    category: cat != null && cat !== "" ? String(cat) : null,
  };
}

function mergeGrantMemoryIntoProfile(
  profile: ProfileData,
  payload: { company?: Record<string, unknown>; financials?: Record<string, unknown>; team?: Record<string, unknown>; pitchSnippets?: Record<string, string> }
): ProfileData {
  const company = payload.company ?? {};
  const financials = payload.financials ?? {};
  const team = payload.team ?? {};
  return {
    ...profile,
    businessName: (company.businessName as string) ?? profile.businessName,
    registrationNumber: (company.registrationNumber as string | null) ?? profile.registrationNumber,
    location: (company.location as string) ?? profile.location,
    sector: (company.sector as string) ?? profile.sector,
    missionStatement: (company.missionStatement as string) ?? profile.missionStatement,
    description: (company.description as string) ?? profile.description,
    employeeCount: financials.employeeCount != null ? Number(financials.employeeCount) : profile.employeeCount,
    annualRevenue: financials.annualRevenue != null ? Number(financials.annualRevenue) : profile.annualRevenue,
    previousGrants: (financials.previousGrants as string | null) ?? profile.previousGrants,
    fundingMin: financials.fundingMin != null ? Number(financials.fundingMin) : profile.fundingMin,
    fundingMax: financials.fundingMax != null ? Number(financials.fundingMax) : profile.fundingMax,
    fundingPurposes: Array.isArray(financials.fundingPurposes) ? (financials.fundingPurposes as string[]) : profile.fundingPurposes,
    fundingDetails: (financials.fundingDetails as string | null) ?? profile.fundingDetails,
    directorNames: (team.directorNames as string | null) ?? profile.directorNames,
    directorProfiles: (team.directorProfiles as string | null) ?? profile.directorProfiles,
    teamMembers: (team.teamMembers as string | null) ?? profile.teamMembers,
    learnedApplicationAnswers: payload.pitchSnippets ?? profile.learnedApplicationAnswers,
  };
}

function mergeProfileOverrides(profile: ProfileData, overrides: Record<string, unknown>): ProfileData {
  return {
    ...profile,
    missionStatement: typeof overrides.missionStatement === "string" ? overrides.missionStatement : profile.missionStatement,
    description: typeof overrides.description === "string" ? overrides.description : profile.description,
    fundingDetails: overrides.fundingDetails !== undefined ? (overrides.fundingDetails == null ? null : String(overrides.fundingDetails)) : profile.fundingDetails,
  };
}

export async function fetchProfileAndDocuments(
  businessProfileId: string,
  applicationId?: string
): Promise<{ profile: ProfileData; documents: DocumentData[] } | null> {
  const { data: profileRow, error: profileError } = await getSupabase()
    .from("BusinessProfile")
    .select("*")
    .eq("id", businessProfileId)
    .maybeSingle();

  if (profileError || !profileRow) return null;

  let profile = normaliseProfile(profileRow as Record<string, unknown>);

  const { data: memoryRow } = await getSupabase()
    .from("GrantMemory")
    .select("payload")
    .eq("profile_id", businessProfileId)
    .maybeSingle();

  if (memoryRow?.payload && typeof memoryRow.payload === "object") {
    const payload = memoryRow.payload as { company?: Record<string, unknown>; financials?: Record<string, unknown>; team?: Record<string, unknown>; pitchSnippets?: Record<string, string> };
    profile = mergeGrantMemoryIntoProfile(profile, payload);
  }

  if (applicationId) {
    const { data: appRow } = await getSupabase()
      .from("Application")
      .select("profile_overrides")
      .eq("id", applicationId)
      .maybeSingle();
    const overrides = (appRow as { profile_overrides?: Record<string, unknown> } | null)?.profile_overrides;
    if (overrides && typeof overrides === "object" && Object.keys(overrides).length > 0) {
      profile = mergeProfileOverrides(profile, overrides);
    }
  }

  const { data: docRowsById } = await getSupabase()
    .from("Document")
    .select("id, name, url, type, size, category")
    .eq("profileId", businessProfileId);

  let docRows = docRowsById;
  if (!docRows?.length) {
    const { data: altRows } = await getSupabase()
      .from("Document")
      .select("id, name, url, type, size, category")
      .eq("profile_id", businessProfileId);
    if (altRows?.length) docRows = altRows;
  }
  if (!docRows?.length) return { profile, documents: [] };

  const documents = (Array.isArray(docRows) ? docRows : []).map((r) =>
    normaliseDocument(r as Record<string, unknown>)
  );

  return { profile, documents };
}
