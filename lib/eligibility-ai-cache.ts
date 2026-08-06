import { createHash } from "crypto";
import type { EligibilityResult } from "@/lib/claude";
import { eligibilityFactsToText, normalizeEligibilityFacts } from "@/lib/eligibility-facts";
import { getSupabaseAdmin } from "@/lib/supabase";

type ProfileLike = Record<string, unknown>;
type GrantLike = {
  id?: string | null;
  name?: string | null;
  funder?: string | null;
  amount?: number | null;
  eligibility?: string | null;
  description?: string | null;
  objectives?: string | null;
  applicantTypes?: string[] | null;
  sectors?: string[] | null;
  regions?: string[] | null;
  deadline?: string | Date | null;
  applicationUrl?: string | null;
};

function positiveIntFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

const CACHE_DAYS = positiveIntFromEnv("ELIGIBILITY_AI_SCORE_CACHE_DAYS", 30);

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = stableValue((value as Record<string, unknown>)[key]);
      return acc;
    }, {});
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function sha256(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function compactText(value: unknown, max = 1600): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function numberOrNull(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean).sort()
    : [];
}

function profileField(profile: ProfileLike, camelKey: string, snakeKey?: string): unknown {
  return profile[camelKey] ?? profile[snakeKey ?? camelKey.replace(/([A-Z])/g, "_$1").toLowerCase()];
}

function normalizedProfile(profile: ProfileLike) {
  return {
    businessName: compactText(profileField(profile, "businessName", "business_name"), 240).toLowerCase(),
    sector: compactText(profileField(profile, "sector"), 240).toLowerCase(),
    missionStatement: compactText(profileField(profile, "missionStatement", "mission_statement"), 1200),
    description: compactText(profileField(profile, "description"), 2200),
    location: compactText(profileField(profile, "location"), 240).toLowerCase(),
    employeeCount: numberOrNull(profileField(profile, "employeeCount", "employee_count")),
    annualRevenue: numberOrNull(profileField(profile, "annualRevenue", "annual_revenue")),
    yearEstablished: numberOrNull(profileField(profile, "yearEstablished", "year_established")),
    incorporationDate: compactText(profileField(profile, "incorporationDate", "incorporation_date"), 120),
    tradingStartDate: compactText(profileField(profile, "tradingStartDate", "trading_start_date"), 120),
    expectedEmployeeGrowth: compactText(profileField(profile, "expectedEmployeeGrowth", "expected_employee_growth"), 600),
    fundingMin: numberOrNull(profileField(profile, "fundingMin", "funding_min")),
    fundingMax: numberOrNull(profileField(profile, "fundingMax", "funding_max")),
    fundingPurposes: stringArray(profileField(profile, "fundingPurposes", "funding_purposes")),
    preferredOpportunityTypes: stringArray(profileField(profile, "preferredOpportunityTypes", "preferred_opportunity_types")),
    fundingDetails: compactText(profileField(profile, "fundingDetails", "funding_details"), 1200),
    fundingUrgency: compactText(profileField(profile, "fundingUrgency", "funding_urgency"), 240).toLowerCase(),
    fundingPosition: compactText(profileField(profile, "fundingPosition", "funding_position"), 360).toLowerCase(),
    documentReadiness: compactText(profileField(profile, "documentReadiness", "document_readiness"), 240).toLowerCase(),
    businessType: compactText(profileField(profile, "businessType", "business_type"), 240).toLowerCase(),
    legalStructure: compactText(profileField(profile, "legalStructure", "legal_structure"), 240).toLowerCase(),
    businessStage: compactText(profileField(profile, "businessStage", "business_stage"), 240).toLowerCase(),
    businessSizeBand: compactText(profileField(profile, "businessSizeBand", "business_size_band"), 240).toLowerCase(),
    founderEmploymentStatus: compactText(profileField(profile, "founderEmploymentStatus", "founder_employment_status"), 240).toLowerCase(),
    localAuthority: compactText(profileField(profile, "localAuthority", "local_authority"), 240).toLowerCase(),
    areasServed: compactText(profileField(profile, "areasServed", "areas_served"), 900).toLowerCase(),
    coFundingCapacity: compactText(profileField(profile, "coFundingCapacity", "co_funding_capacity"), 240).toLowerCase(),
    reimbursementReadiness: compactText(profileField(profile, "reimbursementReadiness", "reimbursement_readiness"), 240).toLowerCase(),
    coFundingAvailable: compactText(profileField(profile, "coFundingAvailable", "co_funding_available"), 900),
    matchFundingDetails: compactText(profileField(profile, "matchFundingDetails", "match_funding_details"), 900),
    previousGrantExperience: compactText(profileField(profile, "previousGrantExperience", "previous_grant_experience"), 240).toLowerCase(),
    previousGrantHistory: compactText(profileField(profile, "previousGrantHistory", "previous_grant_history"), 1200),
    fundingOutcomeSignals: compactText(profileField(profile, "fundingOutcomeSignals", "funding_outcome_signals"), 1200),
    eligibilityFacts: normalizeEligibilityFacts(profileField(profile, "eligibilityFacts", "eligibility_facts")),
  };
}

function normalizedGrant(grant: GrantLike) {
  return {
    name: compactText(grant.name, 300).toLowerCase(),
    funder: compactText(grant.funder, 240).toLowerCase(),
    amount: numberOrNull(grant.amount),
    eligibility: compactText(grant.eligibility, 2600),
    description: compactText(grant.description, 2600),
    objectives: compactText(grant.objectives, 1200),
    applicantTypes: stringArray(grant.applicantTypes),
    sectors: stringArray(grant.sectors),
    regions: stringArray(grant.regions),
    deadline: grant.deadline ? new Date(grant.deadline).toISOString().slice(0, 10) : null,
    applicationUrl: compactText(grant.applicationUrl, 1200).toLowerCase(),
  };
}

export function profileHashForEligibility(profile: ProfileLike): string {
  return sha256(normalizedProfile(profile));
}

export function grantContentHashForEligibility(grant: GrantLike): string {
  return sha256(normalizedGrant(grant));
}

export async function touchEligibilityAiCaches(profile: ProfileLike, grant: GrantLike): Promise<void> {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const profileHash = profileHashForEligibility(profile);
  const grantContentHash = grantContentHashForEligibility(grant);

  try {
    const grantId = grant.id ? String(grant.id) : null;
    if (grantId) {
      await supabase.from("grant_ai_intelligence").upsert(
        {
          grant_id: grantId,
          content_hash: grantContentHash,
          reusable_summary: compactText(
            [grant.name, grant.funder, grant.eligibility, grant.description, grant.objectives].filter(Boolean).join(" | "),
            4000
          ),
          extracted_criteria: normalizedGrant(grant),
          updated_at: now,
        },
        { onConflict: "grant_id" }
      );
    }

    await supabase.from("profile_ai_dna_cache").upsert(
      {
        profile_hash: profileHash,
        dna_summary: compactText(
          [
            profileField(profile, "businessName", "business_name"),
            profileField(profile, "sector"),
            profileField(profile, "businessType", "business_type"),
            profileField(profile, "legalStructure", "legal_structure"),
            profileField(profile, "businessStage", "business_stage"),
            profileField(profile, "businessSizeBand", "business_size_band"),
            profileField(profile, "founderEmploymentStatus", "founder_employment_status"),
            profileField(profile, "missionStatement", "mission_statement"),
            profileField(profile, "description"),
            profileField(profile, "localAuthority", "local_authority"),
            profileField(profile, "areasServed", "areas_served"),
            profileField(profile, "fundingDetails", "funding_details"),
            profileField(profile, "fundingUrgency", "funding_urgency"),
            profileField(profile, "fundingPosition", "funding_position"),
            profileField(profile, "documentReadiness", "document_readiness"),
            profileField(profile, "preferredOpportunityTypes", "preferred_opportunity_types"),
            profileField(profile, "coFundingCapacity", "co_funding_capacity"),
            profileField(profile, "reimbursementReadiness", "reimbursement_readiness"),
            profileField(profile, "coFundingAvailable", "co_funding_available"),
            profileField(profile, "matchFundingDetails", "match_funding_details"),
            profileField(profile, "previousGrantExperience", "previous_grant_experience"),
            profileField(profile, "previousGrantHistory", "previous_grant_history"),
            eligibilityFactsToText(profileField(profile, "eligibilityFacts", "eligibility_facts"), 16),
          ].filter(Boolean).join(" | "),
          4000
        ),
        normalized_profile: normalizedProfile(profile),
        updated_at: now,
      },
      { onConflict: "profile_hash" }
    );
  } catch (error) {
    console.warn("[eligibility-ai-cache] cache touch skipped:", error instanceof Error ? error.message : String(error));
  }
}

export async function getCachedEligibilityDecision(
  profile: ProfileLike,
  grant: GrantLike
): Promise<EligibilityResult | null> {
  const profileHash = profileHashForEligibility(profile);
  const grantContentHash = grantContentHashForEligibility(grant);
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - CACHE_DAYS);

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("eligibility_ai_score_cache")
      .select("result_json, updated_at")
      .eq("profile_hash", profileHash)
      .eq("grant_content_hash", grantContentHash)
      .gte("updated_at", threshold.toISOString())
      .maybeSingle();

    if (error || !data?.result_json) return null;

    await supabase
      .from("eligibility_ai_score_cache")
      .update({ last_used_at: new Date().toISOString() })
      .eq("profile_hash", profileHash)
      .eq("grant_content_hash", grantContentHash);

    return data.result_json as EligibilityResult;
  } catch (error) {
    console.warn("[eligibility-ai-cache] cache read skipped:", error instanceof Error ? error.message : String(error));
    return null;
  }
}

export async function storeCachedEligibilityDecision(
  profile: ProfileLike,
  grant: GrantLike,
  result: EligibilityResult
): Promise<void> {
  const profileHash = profileHashForEligibility(profile);
  const grantContentHash = grantContentHashForEligibility(grant);
  const now = new Date().toISOString();

  try {
    const supabase = getSupabaseAdmin();
    await supabase.from("eligibility_ai_score_cache").upsert(
      {
        profile_hash: profileHash,
        grant_id: grant.id ?? null,
        grant_content_hash: grantContentHash,
        result_json: result,
        score: Number(result.score ?? result.confidence ?? 0),
        decision: result.decision,
        model: process.env.OPENAI_WORKER_MODEL ?? process.env.OPENAI_MODEL ?? "default",
        updated_at: now,
        last_used_at: now,
      },
      { onConflict: "profile_hash,grant_content_hash" }
    );
  } catch (error) {
    console.warn("[eligibility-ai-cache] cache write skipped:", error instanceof Error ? error.message : String(error));
  }
}
