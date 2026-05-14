import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveOrg } from "@/lib/auth";
import { GrantsListClient } from "@/components/grants/grants-list-client";
import { computeUrgency } from "@/lib/urgency";
import { isGrantLinkUsable } from "@/lib/grant-freshness";
import { getAppliedGrantIds } from "@/lib/applied-grants";
import { inferFunderLocationsFromProfile } from "@/lib/constants";

export default async function GrantsPage() {
  const { org, orgId } = await getActiveOrg();
  const supabase = getSupabaseAdmin();

  const { data: grantsData } = await supabase
    .from("Grant")
    .select("*")
    .order("createdAt", { ascending: false });
  const allGrants = Array.isArray(grantsData) ? grantsData.filter(isGrantLinkUsable) : [];
  const latestGrantTimestamp = allGrants.reduce<string | null>((latest, grant) => {
    const raw = grant as { createdAt?: string; created_at?: string; updatedAt?: string; updated_at?: string };
    const value = raw.updatedAt ?? raw.updated_at ?? raw.createdAt ?? raw.created_at ?? null;
    if (!value) return latest;
    if (!latest) return value;
    return new Date(value).getTime() > new Date(latest).getTime() ? value : latest;
  }, null);

  const profile = org.profiles?.[0];
  const hasProfile = !!profile;
  const profileComplete = (profile?.completionScore ?? 0) >= 50;
  const userFunderLocations = inferFunderLocationsFromProfile(profile as {
    funderLocations?: string[] | null;
    location?: string | null;
    country?: string | null;
    region?: string | null;
  } | undefined);
  const appliedGrantIds = profile ? await getAppliedGrantIds(supabase, orgId, profile.id) : new Set<string>();
  const grants = allGrants.filter((grant) => !appliedGrantIds.has(grant.id));

  const cachedScores: Record<string, { score: number; summary?: string; scoringSource?: string }> = {};
  let savedGrantIds: string[] = [];
  if (profileComplete && profile) {
    const { data: rowsData } = await supabase
      .from("EligibilityAssessment")
      .select("grant_id, score, summary, scoring_source")
      .eq("organisation_id", orgId)
      .eq("profile_id", profile.id);
    const rows = Array.isArray(rowsData) ? rowsData : [];
    for (const row of rows as { grant_id: string; score: number; summary: string | null; scoring_source?: string | null }[]) {
      if (appliedGrantIds.has(row.grant_id)) continue;
      const scoringSource = row.scoring_source ?? (row.summary?.startsWith("Preliminary fit") ? "heuristic" : "openai");
      cachedScores[row.grant_id] = {
        score: scoringSource === "heuristic" ? Math.min(row.score, 69) : row.score,
        summary: row.summary ?? undefined,
        scoringSource,
      };
    }
    const { data: savedData } = await supabase
      .from("SavedGrant")
      .select("grant_id")
      .eq("organisation_id", orgId)
      .eq("profile_id", profile.id);
    savedGrantIds = (savedData ?? []).map((r: { grant_id: string }) => r.grant_id);
  }

  return (
    <div className="mx-auto max-w-7xl min-w-0 px-4 py-6 sm:p-6">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Available Grants</h1>
          <p className="mt-1 text-muted-foreground">
            Browse grants or use GrantsCopilot matching to find the best fit for your business.
          </p>
          {latestGrantTimestamp && (
            <p className="mt-1 text-xs font-medium text-muted-foreground">
              Database last updated {new Date(latestGrantTimestamp).toLocaleString("en-GB", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/grants/apply-by-link"
            className="shrink-0 rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Have a grant link? Apply here
          </Link>
        </div>
      </div>

      <GrantsListClient
        grants={grants.map((g) => {
          const urgency = computeUrgency(g.deadline ?? null);
          const raw = g as { createdAt?: string; created_at?: string; url_status?: string; url_checked_at?: string };
          const createdAt = raw.createdAt ?? raw.created_at ?? null;
          return {
            id: g.id,
            name: g.name,
            funder: g.funder,
            amount: g.amount ?? null,
            deadline: g.deadline ?? null,
            sectors: g.sectors ?? [],
            regions: g.regions ?? [],
            applicantTypes: g.applicantTypes ?? [],
            funderLocations: g.funderLocations ?? [],
            source: g.source ?? null,
            eligibility: g.eligibility ?? "",
            applicationUrl: g.applicationUrl ?? "",
            urgencyLevel: urgency.level,
            urgencyLabel: urgency.label,
            createdAt,
            urlStatus: raw.url_status ?? null,
            urlCheckedAt: raw.url_checked_at ?? null,
          };
        })}
        userFunderLocations={userFunderLocations}
        hasProfile={hasProfile}
        profileComplete={profileComplete}
        cachedScores={cachedScores}
        savedGrantIds={savedGrantIds}
      />
    </div>
  );
}
