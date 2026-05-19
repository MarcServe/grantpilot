import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveOrg } from "@/lib/auth";
import { GrantsListClient } from "@/components/grants/grants-list-client";
import { computeUrgency } from "@/lib/urgency";
import { isGrantLinkUsable } from "@/lib/grant-freshness";
import { getAppliedGrantIds } from "@/lib/applied-grants";
import { inferFunderLocationsFromProfile } from "@/lib/constants";
import { applyEligibilityScoreGuards } from "@/lib/eligibility-score-guards";
import { applyOutcomeScoreAdjustment, deriveOutcomeScoreAdjustment } from "@/lib/outcome-learning";
import type { EligibilityResult } from "@/lib/claude";

function latestDate(values: (string | null)[]): string | null {
  return values.reduce<string | null>((latest, value) => {
    if (!value) return latest;
    if (!latest) return value;
    return new Date(value).getTime() > new Date(latest).getTime() ? value : latest;
  }, null);
}

function profileForEligibilityGuards(profile: Record<string, unknown>) {
  return {
    location: String(profile.location ?? ""),
    sector: String(profile.sector ?? ""),
    fundingPurposes: Array.isArray(profile.fundingPurposes) ? profile.fundingPurposes as string[] : (Array.isArray(profile.funding_purposes) ? profile.funding_purposes as string[] : []),
    businessType: String(profile.businessType ?? profile.business_type ?? "") || null,
    employeeCount: profile.employeeCount != null ? Number(profile.employeeCount) : (profile.employee_count != null ? Number(profile.employee_count) : null),
    annualRevenue: profile.annualRevenue != null ? Number(profile.annualRevenue) : (profile.annual_revenue != null ? Number(profile.annual_revenue) : null),
    yearEstablished: profile.yearEstablished != null ? Number(profile.yearEstablished) : (profile.year_established != null ? Number(profile.year_established) : null),
  };
}

export default async function GrantsPage() {
  const { org, orgId } = await getActiveOrg();
  const supabase = getSupabaseAdmin();

  const { data: grantsData } = await supabase
    .from("Grant")
    .select("*")
    .order("createdAt", { ascending: false });
  const allGrants = Array.isArray(grantsData) ? grantsData.filter(isGrantLinkUsable) : [];
  const grantTimestamps = allGrants.map((grant) => {
    const raw = grant as { createdAt?: string; created_at?: string; updatedAt?: string; updated_at?: string };
    return {
      createdAt: raw.createdAt ?? raw.created_at ?? null,
      refreshedAt: raw.updatedAt ?? raw.updated_at ?? raw.createdAt ?? raw.created_at ?? null,
    };
  });
  const latestCreatedAt = latestDate(grantTimestamps.map((item) => item.createdAt));
  const latestRefreshAt = latestDate(grantTimestamps.map((item) => item.refreshedAt));
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfWeek = new Date();
  startOfWeek.setDate(startOfWeek.getDate() - 7);
  const newTodayCount = grantTimestamps.filter((item) => item.createdAt && new Date(item.createdAt) >= startOfToday).length;
  const newThisWeekCount = grantTimestamps.filter((item) => item.createdAt && new Date(item.createdAt) >= startOfWeek).length;

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
      .select("grant_id, score, decision, summary, missing_criteria, improvement_plan, scoring_source")
      .eq("organisation_id", orgId)
      .eq("profile_id", profile.id);
    const { data: outcomeRows } = await supabase
      .from("ApplicationOutcome")
      .select("outcome, awardedAmount, funderFeedback, learningNotes, Grant(name, funder)")
      .eq("organisationId", orgId)
      .eq("profileId", profile.id)
      .order("reportedAt", { ascending: false })
      .limit(8);
    const outcomeAdjustment = deriveOutcomeScoreAdjustment(outcomeRows ?? []);
    const grantById = new Map(allGrants.map((grant) => [grant.id, grant]));
    const rows = Array.isArray(rowsData) ? rowsData : [];
    for (const row of rows as { grant_id: string; score: number; decision?: string | null; summary: string | null; missing_criteria?: string[] | null; improvement_plan?: { gaps?: string[]; actions?: string[]; timeline?: string } | null; scoring_source?: string | null }[]) {
      if (appliedGrantIds.has(row.grant_id)) continue;
      const scoringSource = row.scoring_source ?? (row.summary?.startsWith("Preliminary fit") ? "heuristic" : "openai");
      const baseScore = scoringSource === "heuristic" ? Math.min(row.score, 69) : row.score;
      const grant = grantById.get(row.grant_id);
      const guarded = grant
        ? applyOutcomeScoreAdjustment(applyEligibilityScoreGuards(
            profileForEligibilityGuards(profile as Record<string, unknown>),
            grant,
            {
              decision: row.decision === "likely_eligible" || row.decision === "review" || row.decision === "unlikely" ? row.decision : "review",
              reason: row.summary ?? "",
              confidence: baseScore,
              score: baseScore,
              summary: row.summary ?? undefined,
              reasons: [],
              improvementPlan: row.improvement_plan as EligibilityResult["improvementPlan"],
              met: [],
              missing: row.missing_criteria ?? [],
              winProbability: baseScore,
              evidenceStrength: baseScore >= 80 ? "strong" : baseScore >= 55 ? "medium" : "weak",
            }
          ), outcomeAdjustment)
        : null;
      const score = guarded ? (guarded.score ?? guarded.confidence) : baseScore;
      cachedScores[row.grant_id] = {
        score,
        summary: guarded?.summary ?? row.summary ?? undefined,
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
          <div className="mt-2 space-y-1 text-xs font-medium text-muted-foreground">
            {latestCreatedAt && (
              <p>
                Latest new grant added {new Date(latestCreatedAt).toLocaleString("en-GB", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            )}
            {latestRefreshAt && (
              <p>
                Source refresh last touched records {new Date(latestRefreshAt).toLocaleString("en-GB", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            )}
            <p>{newTodayCount} new today - {newThisWeekCount} new in the last 7 days</p>
          </div>
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
