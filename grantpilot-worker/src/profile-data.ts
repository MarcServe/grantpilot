import { supabase } from "./supabase.js";

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

export async function fetchProfileAndDocuments(
  businessProfileId: string
): Promise<{ profile: ProfileData; documents: DocumentData[] } | null> {
  const { data: profileRow, error: profileError } = await supabase
    .from("BusinessProfile")
    .select("*")
    .eq("id", businessProfileId)
    .maybeSingle();

  if (profileError || !profileRow) return null;

  const profile = normaliseProfile(profileRow as Record<string, unknown>);

  const { data: docRowsById } = await supabase
    .from("Document")
    .select("id, name, url, type, size, category")
    .eq("profileId", businessProfileId);

  let docRows = docRowsById;
  if (!docRows?.length) {
    const { data: altRows } = await supabase
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
