import { getSupabase } from "./supabase.js";

export interface ProfileData {
  businessName: string;
  registrationNumber: string | null;
  location: string;
  sector: string;
  missionStatement: string;
  description: string;
  employeeCount: number | null;
  annualRevenue: number | null;
  previousGrants: string | null;
  fundingMin: number;
  fundingMax: number;
  fundingPurposes: string[];
  fundingDetails: string | null;
  websiteIntelligence: string | null;
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
  return {
    businessName: String(get("businessName") ?? ""),
    registrationNumber: row.registrationNumber != null ? String(row.registrationNumber) : (row.registration_number != null ? String(row.registration_number) : null),
    location: String(get("location") ?? ""),
    sector: String(get("sector") ?? ""),
    missionStatement: String(get("missionStatement") ?? get("mission_statement") ?? ""),
    description: String(get("description") ?? ""),
    employeeCount: row.employeeCount != null ? Number(row.employeeCount) : (row.employee_count != null ? Number(row.employee_count) : null),
    annualRevenue: row.annualRevenue != null ? Number(row.annualRevenue) : (row.annual_revenue != null ? Number(row.annual_revenue) : null),
    previousGrants: row.previousGrants != null ? String(row.previousGrants) : (row.previous_grants != null ? String(row.previous_grants) : null),
    fundingMin: Number(get("fundingMin") ?? get("funding_min") ?? 0),
    fundingMax: Number(get("fundingMax") ?? get("funding_max") ?? 0),
    fundingPurposes: Array.isArray(row.fundingPurposes) ? row.fundingPurposes as string[] : (Array.isArray(row.funding_purposes) ? row.funding_purposes as string[] : []),
    fundingDetails: row.fundingDetails != null ? String(row.fundingDetails) : (row.funding_details != null ? String(row.funding_details) : null),
    websiteIntelligence: row.websiteIntelligence != null ? String(row.websiteIntelligence) : (row.website_intelligence != null ? String(row.website_intelligence) : null),
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
  payload: { company?: Record<string, unknown>; financials?: Record<string, unknown> }
): ProfileData {
  const company = payload.company ?? {};
  const financials = payload.financials ?? {};
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
    const payload = memoryRow.payload as { company?: Record<string, unknown>; financials?: Record<string, unknown> };
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
