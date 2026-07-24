import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAppliedGrantIds } from "@/lib/applied-grants";
import { inferFunderLocationsFromProfile } from "@/lib/constants";
import { getGrantFitPreviews } from "@/lib/grant-fit-preview";
import type { GrantUserState } from "@/lib/eligible-match-rules";

export const dynamic = "force-dynamic";

const MAX_PREVIEW_IDS = 50;

type SavedGrantStateRow = {
  grant_id: string | null;
  status: GrantUserState | null;
};

function uniqueGrantIds(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const id = String(value ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    if (result.length >= MAX_PREVIEW_IDS) break;
  }
  return result;
}

export async function POST(request: Request) {
  let grantIds: string[] = [];
  try {
    const body = await request.json();
    grantIds = uniqueGrantIds(body?.grantIds);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (grantIds.length === 0) {
    return NextResponse.json({ previews: {}, count: 0 });
  }

  const { org, orgId } = await getActiveOrg();
  const profile = org.profiles?.[0] ?? null;
  const supabase = getSupabaseAdmin();

  const { data: grantsData, error: grantsError } = await supabase
    .from("Grant")
    .select("id, name, funder, amount, deadline, eligibility, description, objectives, applicantTypes, sectors, regions, funderLocations, url_status, createdAt")
    .in("id", grantIds);

  if (grantsError) {
    return NextResponse.json({ error: grantsError.message }, { status: 500 });
  }

  const profileComplete = Boolean(profile && (profile.completionScore ?? 0) >= 50);
  const userFunderLocations = inferFunderLocationsFromProfile(profile as {
    funderLocations?: string[] | null;
    location?: string | null;
    country?: string | null;
    region?: string | null;
  } | undefined);
  const appliedGrantIds = profileComplete && profile
    ? await getAppliedGrantIds(supabase, orgId, profile.id)
    : new Set<string>();
  const grantUserStates: Record<string, GrantUserState> = {};

  if (profileComplete && profile) {
    const { data: savedData } = await supabase
      .from("SavedGrant")
      .select("grant_id, status")
      .eq("organisation_id", orgId)
      .eq("profile_id", profile.id)
      .in("grant_id", grantIds);
    for (const row of (savedData ?? []) as SavedGrantStateRow[]) {
      if (row.grant_id) grantUserStates[row.grant_id] = row.status ?? "saved";
    }
  }

  const previews = await getGrantFitPreviews({
    supabase,
    organisationId: orgId,
    profile: profileComplete ? profile as Record<string, unknown> : null,
    grants: grantsData ?? [],
    userFunderLocations,
    grantUserStates,
    appliedGrantIds,
  });

  return NextResponse.json({ previews, count: Object.keys(previews).length });
}
