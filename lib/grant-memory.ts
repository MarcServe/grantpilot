/**
 * Grant Memory: canonical store for prefill data.
 * payload shape: { company: {}, financials: {}, documentsSummary: [], pitchSnippets: {} }
 */

import { getSupabaseAdmin } from "@/lib/supabase";

export interface GrantMemoryPayload {
  company?: {
    businessName?: string;
    registrationNumber?: string | null;
    location?: string;
    sector?: string;
    missionStatement?: string;
    description?: string;
    funderLocations?: string[];
  };
  financials?: {
    employeeCount?: number | null;
    annualRevenue?: number | null;
    previousGrants?: string | null;
    fundingMin?: number;
    fundingMax?: number;
    fundingPurposes?: string[];
    fundingDetails?: string | null;
  };
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
      registrationNumber: (profile.registrationNumber as string | null) ?? null,
      location: profile.location as string,
      sector: profile.sector as string,
      missionStatement: profile.missionStatement as string,
      description: profile.description as string,
      funderLocations: (profile.funderLocations as string[]) ?? [],
    },
    financials: {
      employeeCount: profile.employeeCount as number | null,
      annualRevenue: profile.annualRevenue as number | null,
      previousGrants: (profile.previousGrants as string | null) ?? null,
      fundingMin: Number(profile.fundingMin ?? profile.funding_min ?? 0),
      fundingMax: Number(profile.fundingMax ?? profile.funding_max ?? 0),
      fundingPurposes: (profile.fundingPurposes as string[]) ?? [],
      fundingDetails: (profile.fundingDetails as string | null) ?? (profile.funding_details as string | null) ?? null,
    },
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
