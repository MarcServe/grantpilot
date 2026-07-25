import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { inferFunderLocationsFromProfile } from "@/lib/constants";
import { getGrantFitPreviews, type GrantFitPreview, type GrantFitPreviewGrant } from "@/lib/grant-fit-preview";
import { isGrantActionableNow } from "@/lib/grant-actionability";
import type { GrantUserState } from "@/lib/eligible-match-rules";

export const dynamic = "force-dynamic";

const PROFILE_LIMIT = 100;
const TOP_ASSESSMENT_LIMIT = 80;
const RECENT_LIBRARY_LIMIT = 50;

type BusinessProfileRow = Record<string, unknown> & {
  id: string;
  organisationId?: string | null;
  organisation_id?: string | null;
  businessName?: string | null;
  business_name?: string | null;
  completionScore?: number | null;
  completion_score?: number | null;
  sector?: string | null;
  location?: string | null;
  updatedAt?: string | null;
  updated_at?: string | null;
};

type OrganisationRow = {
  id: string;
  name: string | null;
};

type ProfileOption = {
  id: string;
  organisationId: string;
  businessName: string;
  organisationName: string;
  completionScore: number;
  sector: string | null;
  location: string | null;
};

type SavedGrantStateRow = {
  grant_id: string | null;
  status: GrantUserState | null;
};

type ApplicationGrantRow = {
  grantId?: string | null;
  grant_id?: string | null;
};

type AssessmentRow = {
  grant_id: string | null;
  score: number | null;
  scoring_source: string | null;
  summary: string | null;
  updated_at: string | null;
};

type AuditGrant = {
  grantId: string;
  name: string;
  funder: string;
  addedAt: string | null;
  score: number | null;
  scoringSource: string | null;
  matchSection: GrantFitPreview["matchSection"];
  summary: string | null;
  targetSummary: string | null;
  missingCriteria: string[];
  whyNotSuggested: string[];
};

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!(await isAdmin())) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user };
}

function text(value: unknown, fallback = ""): string {
  const raw = String(value ?? "").trim();
  return raw || fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function profileOrgId(profile: BusinessProfileRow): string {
  return text(profile.organisationId ?? profile.organisation_id);
}

function profileName(profile: BusinessProfileRow): string {
  return text(profile.businessName ?? profile.business_name, "Unnamed profile");
}

function profileCompletion(profile: BusinessProfileRow): number {
  return Math.round(numberValue(profile.completionScore ?? profile.completion_score, 0));
}

function grantName(grant: GrantFitPreviewGrant): string {
  return text(grant.name, "Untitled grant");
}

function grantFunder(grant: GrantFitPreviewGrant): string {
  return text(grant.funder, "Unknown funder");
}

function mapProfileOptions(profiles: BusinessProfileRow[], orgs: OrganisationRow[]): ProfileOption[] {
  const orgNames = new Map(orgs.map((org) => [org.id, org.name ?? "Organisation"]));
  return profiles
    .map((profile) => {
      const organisationId = profileOrgId(profile);
      return {
        id: profile.id,
        organisationId,
        businessName: profileName(profile),
        organisationName: orgNames.get(organisationId) ?? "Organisation",
        completionScore: profileCompletion(profile),
        sector: text(profile.sector) || null,
        location: text(profile.location) || null,
      };
    })
    .filter((profile) => profile.organisationId);
}

async function listProfiles() {
  const supabase = getSupabaseAdmin();
  const { data: profilesData, error } = await supabase
    .from("BusinessProfile")
    .select("id, businessName, organisationId, completionScore, sector, location, updatedAt")
    .order("updatedAt", { ascending: false })
    .limit(PROFILE_LIMIT);

  if (error) throw new Error(error.message);

  const profiles = (profilesData ?? []) as BusinessProfileRow[];
  const orgIds = Array.from(new Set(profiles.map(profileOrgId).filter(Boolean)));
  const { data: orgData } = orgIds.length
    ? await supabase.from("Organisation").select("id, name").in("id", orgIds)
    : { data: [] };

  return mapProfileOptions(profiles, (orgData ?? []) as OrganisationRow[]);
}

function auditGrantFromPreview(grant: GrantFitPreviewGrant, preview: GrantFitPreview): AuditGrant {
  return {
    grantId: grant.id,
    name: grantName(grant),
    funder: grantFunder(grant),
    addedAt: grant.createdAt ?? null,
    score: preview.score,
    scoringSource: preview.scoringSource,
    matchSection: preview.matchSection,
    summary: preview.summary,
    targetSummary: preview.targetSummary,
    missingCriteria: preview.missingCriteria,
    whyNotSuggested: preview.whyNotSuggested,
  };
}

function sortAuditGrants(a: AuditGrant, b: AuditGrant): number {
  const scoreDelta = (b.score ?? -1) - (a.score ?? -1);
  if (scoreDelta !== 0) return scoreDelta;
  const bDate = b.addedAt ? new Date(b.addedAt).getTime() : 0;
  const aDate = a.addedAt ? new Date(a.addedAt).getTime() : 0;
  return bDate - aDate;
}

async function buildAudit(profileId: string) {
  const supabase = getSupabaseAdmin();
  const { data: profileData, error: profileError } = await supabase
    .from("BusinessProfile")
    .select("*")
    .eq("id", profileId)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);
  if (!profileData) throw new Error("Profile not found.");

  const profile = profileData as BusinessProfileRow;
  const organisationId = profileOrgId(profile);
  if (!organisationId) throw new Error("Profile has no organisation.");

  const { data: orgData } = await supabase
    .from("Organisation")
    .select("id, name")
    .eq("id", organisationId)
    .maybeSingle();

  const nowIso = new Date().toISOString();
  const [savedResult, applicationsResult, assessmentsResult, recentGrantsResult] = await Promise.all([
    supabase
      .from("SavedGrant")
      .select("grant_id, status")
      .eq("organisation_id", organisationId)
      .eq("profile_id", profile.id),
    supabase
      .from("Application")
      .select("grantId")
      .eq("organisationId", organisationId)
      .eq("profileId", profile.id),
    supabase
      .from("EligibilityAssessment")
      .select("grant_id, score, scoring_source, summary, updated_at")
      .eq("organisation_id", organisationId)
      .eq("profile_id", profile.id)
      .order("score", { ascending: false, nullsFirst: false })
      .limit(TOP_ASSESSMENT_LIMIT),
    supabase
      .from("Grant")
      .select("id, name, funder, amount, deadline, eligibility, description, objectives, applicantTypes, sectors, regions, funderLocations, url_status, createdAt")
      .or(`deadline.is.null,deadline.gte.${nowIso}`)
      .not("url_status", "in", "(dead,expired)")
      .order("createdAt", { ascending: false })
      .limit(RECENT_LIBRARY_LIMIT),
  ]);

  if (savedResult.error) throw new Error(savedResult.error.message);
  if (applicationsResult.error) throw new Error(applicationsResult.error.message);
  if (assessmentsResult.error) throw new Error(assessmentsResult.error.message);
  if (recentGrantsResult.error) throw new Error(recentGrantsResult.error.message);

  const savedStates: Record<string, GrantUserState> = {};
  for (const row of (savedResult.data ?? []) as SavedGrantStateRow[]) {
    if (row.grant_id) savedStates[row.grant_id] = row.status ?? "saved";
  }

  const appliedGrantIds = new Set(
    ((applicationsResult.data ?? []) as ApplicationGrantRow[])
      .map((row) => row.grantId ?? row.grant_id)
      .filter((id): id is string => Boolean(id))
  );

  const assessmentGrantIds = Array.from(
    new Set(((assessmentsResult.data ?? []) as AssessmentRow[]).map((row) => row.grant_id).filter((id): id is string => Boolean(id)))
  );
  const { data: assessedGrantData, error: grantsError } = assessmentGrantIds.length
    ? await supabase
        .from("Grant")
        .select("id, name, funder, amount, deadline, eligibility, description, objectives, applicantTypes, sectors, regions, funderLocations, url_status, createdAt")
        .in("id", assessmentGrantIds)
    : { data: [], error: null };
  if (grantsError) throw new Error(grantsError.message);

  const assessedGrants = ((assessedGrantData ?? []) as GrantFitPreviewGrant[]).filter((grant) => isGrantActionableNow(grant));
  const recentGrants = ((recentGrantsResult.data ?? []) as GrantFitPreviewGrant[]).filter((grant) => isGrantActionableNow(grant));
  const userFunderLocations = inferFunderLocationsFromProfile(profile);

  const assessedPreviews = await getGrantFitPreviews({
    supabase,
    organisationId,
    profile,
    grants: assessedGrants,
    userFunderLocations,
    grantUserStates: savedStates,
    appliedGrantIds,
  });
  const recentPreviews = await getGrantFitPreviews({
    supabase,
    organisationId,
    profile,
    grants: recentGrants,
    userFunderLocations,
    grantUserStates: savedStates,
    appliedGrantIds,
  });

  const topMatched = assessedGrants
    .map((grant) => assessedPreviews[grant.id] ? auditGrantFromPreview(grant, assessedPreviews[grant.id]) : null)
    .filter((grant): grant is AuditGrant => Boolean(grant))
    .filter((grant) => (grant.score ?? 0) >= 50)
    .sort(sortAuditGrants)
    .slice(0, 10);

  const promisingLibraryNotSuggested = recentGrants
    .map((grant) => recentPreviews[grant.id] ? auditGrantFromPreview(grant, recentPreviews[grant.id]) : null)
    .filter((grant): grant is AuditGrant => Boolean(grant))
    .filter((grant) => grant.matchSection !== "suggested")
    .slice(0, 10);

  const assessedCount = ((assessmentsResult.data ?? []) as AssessmentRow[]).length;
  const assessedPreviewValues = Object.values(assessedPreviews);
  const trustedStrong = assessedPreviewValues.filter((preview) => preview.matchSection === "suggested").length;
  const withinReach = assessedPreviewValues.filter((preview) => preview.matchSection === "within_reach").length;

  return {
    profile: {
      id: profile.id,
      organisationId,
      businessName: profileName(profile),
      organisationName: (orgData as OrganisationRow | null)?.name ?? "Organisation",
      completionScore: profileCompletion(profile),
      sector: text(profile.sector) || null,
      location: text(profile.location) || null,
    },
    summary: {
      assessedCount,
      trustedStrong,
      withinReach,
      recentLibraryChecked: recentGrants.length,
      savedStates: Object.keys(savedStates).length,
      applied: appliedGrantIds.size,
    },
    topMatched,
    promisingLibraryNotSuggested,
  };
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const profileId = searchParams.get("profileId")?.trim();
    const profiles = await listProfiles();
    if (!profileId) {
      return NextResponse.json({ profiles, audit: null });
    }
    const audit = await buildAudit(profileId);
    return NextResponse.json({ profiles, audit });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Profile match audit failed." },
      { status: 500 }
    );
  }
}
