/**
 * Grant Memory: canonical store for prefill data.
 * payload shape: { company: {}, financials: {}, documentsSummary: [], pitchSnippets: {} }
 */

import { getSupabaseAdmin } from "@/lib/supabase";
import { normalizeEligibilityFacts, type EligibilityFact } from "@/lib/eligibility-facts";

export interface GrantMemoryPayload {
  company?: {
    businessName?: string;
    tradingName?: string | null;
    registrationNumber?: string | null;
    charityNumber?: string | null;
    vatNumber?: string | null;
    yearEstablished?: number | null;
    registeredAddress?: string | null;
    operatingAddress?: string | null;
    postcode?: string | null;
    country?: string | null;
    region?: string | null;
    primaryContactName?: string | null;
    primaryContactRole?: string | null;
    primaryContactEmail?: string | null;
    primaryContactPhone?: string | null;
    primaryContactLinkedIn?: string | null;
    preferredContactMethod?: string | null;
    location?: string;
    businessType?: string | null;
    legalStructure?: string | null;
    businessStage?: string | null;
    businessSizeBand?: string | null;
    founderEmploymentStatus?: string | null;
    incorporationDate?: string | null;
    tradingStartDate?: string | null;
    expectedEmployeeGrowth?: string | null;
    localAuthority?: string | null;
    areasServed?: string | null;
    sector?: string;
    missionStatement?: string;
    description?: string;
    funderLocations?: string[];
  };
  financials?: {
    employeeCount?: number | null;
    contractorCount?: number | null;
    annualRevenue?: number | null;
    profitLoss?: string | null;
    cashReserves?: string | null;
    financialProjections?: string | null;
    previousGrants?: string | null;
    previousGrantExperience?: string | null;
    fundingMin?: number;
    fundingMax?: number;
    fundingPurposes?: string[];
    preferredOpportunityTypes?: string[];
    fundingDetails?: string | null;
    fundingUrgency?: string | null;
    fundingPosition?: string | null;
    documentReadiness?: string | null;
    coFundingCapacity?: string | null;
    reimbursementReadiness?: string | null;
    coFundingAvailable?: string | null;
    matchFundingDetails?: string | null;
    previousGrantHistory?: string | null;
  };
  team?: {
    directorNames?: string | null;
    directorProfiles?: string | null;
    teamMembers?: string | null;
    teamExpertise?: string | null;
    boardMembers?: string | null;
    founderBackground?: string | null;
  };
  applicationBrief?: Record<string, unknown>;
  eligibilityFacts?: EligibilityFact[];
  documentsSummary?: { name: string; type: string; category?: string | null }[];
  pitchSnippets?: Record<string, string>;
}

function buildPayloadFromProfile(profile: Record<string, unknown>): GrantMemoryPayload {
  const docs = (profile.documents ?? profile.Document ?? []) as { name: string; type: string; category?: string | null }[];
  const documentsSummary = Array.isArray(docs)
    ? docs.map((d) => ({ name: d.name, type: d.type ?? "", category: d.category ?? null }))
    : [];

  return {
    company: {
      businessName: profile.businessName as string,
      tradingName: (profile.tradingName as string | null) ?? null,
      registrationNumber: (profile.registrationNumber as string | null) ?? null,
      charityNumber: (profile.charityNumber as string | null) ?? null,
      vatNumber: (profile.vatNumber as string | null) ?? null,
      yearEstablished: (profile.yearEstablished as number | null) ?? null,
      registeredAddress: (profile.registeredAddress as string | null) ?? null,
      operatingAddress: (profile.operatingAddress as string | null) ?? null,
      postcode: (profile.postcode as string | null) ?? null,
      country: (profile.country as string | null) ?? null,
      region: (profile.region as string | null) ?? null,
      primaryContactName: (profile.primaryContactName as string | null) ?? null,
      primaryContactRole: (profile.primaryContactRole as string | null) ?? null,
      primaryContactEmail: (profile.primaryContactEmail as string | null) ?? null,
      primaryContactPhone: (profile.primaryContactPhone as string | null) ?? null,
      primaryContactLinkedIn: (profile.primaryContactLinkedIn as string | null) ?? null,
      preferredContactMethod: (profile.preferredContactMethod as string | null) ?? null,
      location: profile.location as string,
      businessType: (profile.businessType as string | null) ?? null,
      legalStructure: (profile.legalStructure as string | null) ?? null,
      businessStage: (profile.businessStage as string | null) ?? null,
      businessSizeBand: (profile.businessSizeBand as string | null) ?? null,
      founderEmploymentStatus: (profile.founderEmploymentStatus as string | null) ?? null,
      incorporationDate: (profile.incorporationDate as string | null) ?? null,
      tradingStartDate: (profile.tradingStartDate as string | null) ?? null,
      expectedEmployeeGrowth: (profile.expectedEmployeeGrowth as string | null) ?? null,
      localAuthority: (profile.localAuthority as string | null) ?? null,
      areasServed: (profile.areasServed as string | null) ?? null,
      sector: profile.sector as string,
      missionStatement: profile.missionStatement as string,
      description: profile.description as string,
      funderLocations: (profile.funderLocations as string[]) ?? [],
    },
    financials: {
      employeeCount: profile.employeeCount as number | null,
      contractorCount: (profile.contractorCount as number | null) ?? null,
      annualRevenue: profile.annualRevenue as number | null,
      profitLoss: (profile.profitLoss as string | null) ?? null,
      cashReserves: (profile.cashReserves as string | null) ?? null,
      financialProjections: (profile.financialProjections as string | null) ?? null,
      previousGrants: (profile.previousGrants as string | null) ?? null,
      previousGrantExperience: (profile.previousGrantExperience as string | null) ?? null,
      fundingMin: Number(profile.fundingMin ?? profile.funding_min ?? 0),
      fundingMax: Number(profile.fundingMax ?? profile.funding_max ?? 0),
      fundingPurposes: (profile.fundingPurposes as string[]) ?? [],
      preferredOpportunityTypes: (profile.preferredOpportunityTypes as string[]) ?? [],
      fundingDetails: (profile.fundingDetails as string | null) ?? (profile.funding_details as string | null) ?? null,
      fundingUrgency: (profile.fundingUrgency as string | null) ?? (profile.funding_urgency as string | null) ?? null,
      fundingPosition: (profile.fundingPosition as string | null) ?? (profile.funding_position as string | null) ?? null,
      documentReadiness: (profile.documentReadiness as string | null) ?? (profile.document_readiness as string | null) ?? null,
      coFundingCapacity: (profile.coFundingCapacity as string | null) ?? null,
      reimbursementReadiness: (profile.reimbursementReadiness as string | null) ?? null,
      coFundingAvailable: (profile.coFundingAvailable as string | null) ?? null,
      matchFundingDetails: (profile.matchFundingDetails as string | null) ?? null,
      previousGrantHistory: (profile.previousGrantHistory as string | null) ?? (profile.previous_grant_history as string | null) ?? null,
    },
    team: {
      directorNames: (profile.directorNames as string | null) ?? (profile.director_names as string | null) ?? null,
      directorProfiles: (profile.directorProfiles as string | null) ?? (profile.director_profiles as string | null) ?? null,
      teamMembers: (profile.teamMembers as string | null) ?? (profile.team_members as string | null) ?? null,
      teamExpertise: (profile.teamExpertise as string | null) ?? (profile.team_expertise as string | null) ?? null,
      boardMembers: (profile.boardMembers as string | null) ?? null,
      founderBackground: (profile.founderBackground as string | null) ?? null,
    },
    applicationBrief: {
      projectTitle: profile.projectTitle,
      projectSummary: profile.projectSummary,
      problemStatement: profile.problemStatement,
      proposedSolution: profile.proposedSolution,
      projectObjectives: profile.projectObjectives,
      expectedOutcomes: profile.expectedOutcomes,
      projectStartDate: profile.projectStartDate,
      projectEndDate: profile.projectEndDate,
      beneficiaryGroups: profile.beneficiaryGroups,
      beneficiaryCount: profile.beneficiaryCount,
      geographicImpact: profile.geographicImpact,
      diversityInclusionImpact: profile.diversityInclusionImpact,
      jobsCreated: profile.jobsCreated,
      revenueGrowthExpected: profile.revenueGrowthExpected,
      co2Reduction: profile.co2Reduction,
      productivityImprovements: profile.productivityImprovements,
      milestones: profile.milestones,
      deliverables: profile.deliverables,
      partnerOrganisations: profile.partnerOrganisations,
      collaborationDetails: profile.collaborationDetails,
      risksMitigation: profile.risksMitigation,
      exitStrategy: profile.exitStrategy,
      projectSustainabilityPlan: profile.projectSustainabilityPlan,
    },
    eligibilityFacts: normalizeEligibilityFacts(profile.eligibilityFacts),
    documentsSummary,
    pitchSnippets: {},
  };
}

/**
 * Merge application filled_snapshot into payload (e.g. field labels -> values as pitchSnippets).
 */
function mergeSnapshotIntoPayload(
  payload: GrantMemoryPayload,
  snapshot: { fields?: { label?: string; value?: string }[] }
): GrantMemoryPayload {
  const pitchSnippets = { ...(payload.pitchSnippets ?? {}) };
  const fields = snapshot?.fields ?? [];
  for (const f of fields) {
    const label = f.label ?? "";
    const value = f.value ?? "";
    if (label && value && typeof value === "string" && value.length < 2000) {
      pitchSnippets[label] = value;
    }
  }
  return { ...payload, pitchSnippets };
}

/**
 * Upsert GrantMemory for the given profile from current profile data.
 */
export async function syncGrantMemoryFromProfile(profileId: string, organisationId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: profile } = await supabase
    .from("BusinessProfile")
    .select("*, Document(id, name, type, category)")
    .eq("id", profileId)
    .single();

  if (!profile) return;

  const rawDocs = (profile as Record<string, unknown>).Document ?? (profile as Record<string, unknown>).document ?? [];
  const documents = Array.isArray(rawDocs) ? rawDocs : [];
  const payload = buildPayloadFromProfile({ ...profile, documents });

  await supabase
    .from("GrantMemory")
    .upsert(
      {
        organisation_id: organisationId,
        profile_id: profileId,
        payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id" }
    );
}

/**
 * Merge application filled_snapshot into the profile's GrantMemory and upsert.
 */
export async function mergeGrantMemoryFromSnapshot(
  profileId: string,
  organisationId: string,
  filledSnapshot: unknown
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const snapshot = filledSnapshot as { fields?: { label?: string; value?: string }[] };
  if (!snapshot?.fields?.length) return;

  const { data: existing } = await supabase
    .from("GrantMemory")
    .select("payload")
    .eq("profile_id", profileId)
    .maybeSingle();

  const currentPayload = (existing?.payload ?? {}) as GrantMemoryPayload;
  let basePayload = currentPayload;
  if (Object.keys(currentPayload).length === 0) {
    const { data: profileRow } = await supabase
      .from("BusinessProfile")
      .select("*, Document(id, name, type, category)")
      .eq("id", profileId)
      .single();
    const rawDocs = (profileRow as Record<string, unknown>)?.Document ?? [];
    basePayload = buildPayloadFromProfile({ ...profileRow, documents: Array.isArray(rawDocs) ? rawDocs : [] });
  }
  const merged = mergeSnapshotIntoPayload(basePayload, snapshot);

  await supabase
    .from("GrantMemory")
    .upsert(
      {
        organisation_id: organisationId,
        profile_id: profileId,
        payload: merged,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id" }
    );
}

/**
 * Get GrantMemory payload for a profile (for prefill). Returns null if none.
 */
export async function getGrantMemory(profileId: string): Promise<GrantMemoryPayload | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("GrantMemory")
    .select("payload")
    .eq("profile_id", profileId)
    .maybeSingle();
  return (data?.payload as GrantMemoryPayload) ?? null;
}
