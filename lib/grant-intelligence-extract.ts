import { cleanJsonResponse, completeJson } from "@/lib/openai-client";
import { grantContentHashForEligibility } from "@/lib/eligibility-ai-cache";
import {
  grantIntelligenceFromDb,
  grantIntelligenceToDb,
  isReadyGrantIntelligence,
  normalizeGrantIntelligence,
  type GrantIntelligence,
  type GrantIntelligenceDbRow,
} from "@/lib/grant-intelligence-schema";
import { isGrantActionableNow } from "@/lib/grant-actionability";
import { getSupabaseAdmin } from "@/lib/supabase";

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

export type GrantForIntelligence = {
  id: string;
  name: string;
  funder?: string | null;
  amount?: number | null;
  deadline?: string | null;
  applicationUrl?: string | null;
  eligibility?: string | null;
  description?: string | null;
  objectives?: string | null;
  applicantTypes?: string[] | null;
  sectors?: string[] | null;
  regions?: string[] | null;
  url_status?: string | null;
};

const GRANT_INTELLIGENCE_MODEL = process.env.OPENAI_GRANT_INTELLIGENCE_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";

function mergeArrays(...values: Array<string[] | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    for (const item of value ?? []) {
      const text = String(item ?? "").trim();
      if (!text) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(text);
    }
  }
  return result.slice(0, 30);
}

function grantText(grant: GrantForIntelligence): string {
  return [
    `Name: ${grant.name}`,
    `Funder: ${grant.funder ?? "Unknown"}`,
    grant.amount != null ? `Amount: ${grant.amount}` : null,
    grant.deadline ? `Deadline: ${grant.deadline}` : null,
    grant.applicationUrl ? `Application URL: ${grant.applicationUrl}` : null,
    grant.eligibility ? `Eligibility: ${grant.eligibility}` : null,
    grant.description ? `Description: ${grant.description}` : null,
    grant.objectives ? `Objectives: ${grant.objectives}` : null,
    grant.applicantTypes?.length ? `Applicant types: ${grant.applicantTypes.join(", ")}` : null,
    grant.sectors?.length ? `Sectors: ${grant.sectors.join(", ")}` : null,
    grant.regions?.length ? `Regions: ${grant.regions.join(", ")}` : null,
  ].filter(Boolean).join("\n");
}

function extractionPrompt(grant: GrantForIntelligence): string {
  return `You extract reusable grant eligibility intelligence for a grant-matching product.

Return STRICT JSON only with this shape:
{
  "confidence": 0-100,
  "reusableSummary": "short factual grant summary",
  "eligibilityCriteria": ["criteria visible in the source text"],
  "hardGates": ["must-have gates that should block unsuitable applicants"],
  "applicantTypes": ["SME", "startup", "company", "charity", "individual", etc],
  "sectors": ["technology", "health", "AI", etc],
  "regions": ["UK", "EU", "Global", etc],
  "fundingPurposes": ["R&D", "prototype", "innovation", etc],
  "semanticTags": ["search/relevance tags"],
  "measurableRequirements": [{"label":"requirement", "value":"optional value", "required":true}],
  "exclusions": ["who is not eligible or stale/closed signals"],
  "freshness": {"status":"current|stale|unknown", "deadline":"ISO date or null", "evidence":["date/deadline text"]},
  "scoringHints": {"strongSignals":["signals"], "weakSignals":["signals"], "redFlags":["risks"]},
  "extractedCriteria": {"notes":"other structured facts"}
}

Rules:
- Extract grant facts only. Do not judge any specific business.
- Mark freshness.status "stale" if the text clearly says closed, expired, winner announced in the past, or past application windows.
- Do not invent revenue, age, team size, or sector requirements when not stated.
- Prefer UK/EU/global eligibility details when visible.
- Keep hardGates strict and factual.

Grant text:
${grantText(grant)}`;
}

export async function extractGrantIntelligence(grant: GrantForIntelligence): Promise<GrantIntelligence> {
  if (!isGrantActionableNow(grant)) {
    return normalizeGrantIntelligence({
      status: "stale",
      confidence: 85,
      reusableSummary: `${grant.name} is not currently actionable based on its deadline or URL status.`,
      eligibilityCriteria: [],
      hardGates: ["Grant is expired, dead, or not currently actionable"],
      applicantTypes: grant.applicantTypes ?? [],
      sectors: grant.sectors ?? [],
      regions: grant.regions ?? [],
      freshness: {
        status: "stale",
        deadline: grant.deadline ?? null,
        evidence: ["Local actionability check marked this grant stale."],
      },
      scoringHints: {
        strongSignals: [],
        weakSignals: [],
        redFlags: ["Do not recommend until source is current."],
      },
    });
  }

  const raw = await completeJson(extractionPrompt(grant), 1800);
  const parsed = JSON.parse(cleanJsonResponse(raw)) as Record<string, unknown>;
  const intelligence = normalizeGrantIntelligence({
    ...parsed,
    status: "ready",
    model: GRANT_INTELLIGENCE_MODEL,
  });

  return {
    ...intelligence,
    applicantTypes: mergeArrays(intelligence.applicantTypes, grant.applicantTypes ?? []),
    sectors: mergeArrays(intelligence.sectors, grant.sectors ?? []),
    regions: mergeArrays(intelligence.regions, grant.regions ?? []),
    reusableSummary: intelligence.reusableSummary || grant.description || grant.eligibility || grant.name,
  };
}

export async function fetchGrantIntelligenceForGrantIds(
  supabase: SupabaseAdmin,
  grantIds: string[]
): Promise<Map<string, GrantIntelligence>> {
  const ids = Array.from(new Set(grantIds.filter(Boolean)));
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase
    .from("grant_ai_intelligence")
    .select("grant_id, content_hash, status, model, confidence, reusable_summary, extracted_criteria, eligibility_criteria, hard_gates, applicant_types, sectors, regions, funding_purposes, semantic_tags, measurable_requirements, exclusions, freshness, scoring_hints, reusable_prompt, extraction_error")
    .in("grant_id", ids);
  if (error) {
    console.warn("[grant-intelligence] fetch skipped:", error.message);
    return new Map();
  }

  const result = new Map<string, GrantIntelligence>();
  for (const row of (data ?? []) as GrantIntelligenceDbRow[]) {
    const intelligence = grantIntelligenceFromDb(row);
    if (isReadyGrantIntelligence(intelligence)) result.set(row.grant_id, intelligence);
  }
  return result;
}

export async function upsertGrantIntelligence(
  supabase: SupabaseAdmin,
  grant: GrantForIntelligence,
  intelligence: GrantIntelligence
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase.from("grant_ai_intelligence").upsert({
    grant_id: grant.id,
    content_hash: grantContentHashForEligibility(grant),
    ...grantIntelligenceToDb(intelligence),
    extracted_at: intelligence.status === "ready" ? now : null,
    updated_at: now,
  }, { onConflict: "grant_id" });
  if (error) throw error;
}
