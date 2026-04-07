import Link from "next/link";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { grantMatchesFunderLocations } from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Building2 } from "lucide-react";
import type { EligibleGrant } from "@/components/grants/eligible-grant-card";
import { EligibleGrantsList } from "@/components/grants/eligible-grants-list";

export default async function EligibleGrantsPage() {
  const { org, orgId } = await getActiveOrg();
  const supabase = getSupabaseAdmin();

  const profile = org.profiles?.[0];
  const completionScore = (profile as { completionScore?: number; completion_score?: number } | undefined)?.completionScore
    ?? (profile as { completion_score?: number } | undefined)?.completion_score
    ?? 0;
  const profileId = (profile as { id?: string } | undefined)?.id;

  if (!profile || !profileId) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <Link
          href="/dashboard"
          className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold">Create your business profile</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              We need your profile to match you with eligible grants.
            </p>
            <Link href="/profile" className="mt-4">
              <Button size="sm">Go to Profile <ArrowRight className="ml-1 h-3 w-3" /></Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // First try: filter by both org and profile
  const { data: assessmentsData0, error: assessmentsError } = await supabase
    .from("EligibilityAssessment")
    .select("grant_id, score, decision, summary, missing_criteria, improvement_plan, updated_at")
    .eq("organisation_id", orgId)
    .eq("profile_id", profileId)
    .order("score", { ascending: false });
  let assessmentsData = assessmentsData0;
  const initialAssessmentsError = assessmentsError;

  // Fallback: if nothing found with profileId, try org-only query
  // (handles mismatch between profile ID in auth vs eligibility pipeline)
  if ((!assessmentsData || assessmentsData.length === 0) && !initialAssessmentsError) {
    const fallback = await supabase
      .from("EligibilityAssessment")
      .select("grant_id, score, decision, summary, missing_criteria, improvement_plan, updated_at, profile_id")
      .eq("organisation_id", orgId)
      .order("score", { ascending: false });
    if (fallback.data && fallback.data.length > 0) {
      console.warn(`[eligible-page] profileId mismatch: page uses "${profileId}" but DB has "${(fallback.data[0] as { profile_id: string }).profile_id}" — using org-only fallback (${fallback.data.length} rows)`);
      assessmentsData = fallback.data;
    }
  }

  if (assessmentsError) {
    console.error("[eligible-page] assessments query error:", assessmentsError);
  }

  const assessments = (assessmentsData ?? []) as {
    grant_id: string;
    score: number;
    decision: string | null;
    summary: string | null;
    missing_criteria: string[] | null;
    improvement_plan: { gaps?: string[]; actions?: string[] } | null;
    updated_at: string;
  }[];

  const grantIds = assessments.map((a) => a.grant_id);
  let grantsMap = new Map<string, { id: string; name: string; funder: string; deadline: string | null; funderLocations?: string[] }>();

  if (grantIds.length > 0) {
    // Batch .in() queries to avoid URL length limits (Supabase/PostgREST caps ~8KB)
    const BATCH_SIZE = 200;
    const allGrantsData: { id: string; name: string; funder: string; deadline: string | null; funderLocations?: string[]; url_status?: string }[] = [];
    for (let i = 0; i < grantIds.length; i += BATCH_SIZE) {
      const batch = grantIds.slice(i, i + BATCH_SIZE);
      const { data: batchData, error: grantErr } = await supabase
        .from("Grant")
        .select("id, name, funder, deadline, funderLocations, url_status")
        .in("id", batch);
      if (grantErr) {
        console.error("[eligible-page] grants query error:", grantErr);
      }
      if (batchData) allGrantsData.push(...(batchData as typeof allGrantsData));
    }

    const validGrants = allGrantsData.filter(
      (g) => (g.url_status ?? "unknown") !== "dead" && (g.url_status ?? "unknown") !== "expired"
    );

    const userFunderLocations = (profile as { funderLocations?: string[] }).funderLocations;
    const locationFiltered = validGrants.filter((g) =>
      grantMatchesFunderLocations(g.funderLocations, userFunderLocations)
    );

    console.info(`[eligible-page] org=${orgId} profile=${profileId}: ${assessments.length} assessments, ${allGrantsData.length} grants fetched, ${validGrants.length} not dead/expired, ${locationFiltered.length} pass location filter`);

    grantsMap = new Map(locationFiltered.map((g) => [g.id, g]));
  }

  const allGrants: EligibleGrant[] = [];
  let suggestedCount = 0;
  let withinReachCount = 0;
  let otherCount = 0;

  for (const a of assessments) {
    const grant = grantsMap.get(a.grant_id);
    if (!grant) continue;

    allGrants.push({
      grantId: a.grant_id,
      grantName: grant.name,
      funder: grant.funder,
      deadline: grant.deadline,
      score: a.score,
      decision: a.decision,
      summary: a.summary,
      missingCriteria: a.missing_criteria,
      improvementPlan: a.improvement_plan,
    });

    if (a.score >= 80) suggestedCount++;
    else if (a.score >= 50) withinReachCount++;
    else otherCount++;
  }

  const totalScored = allGrants.length;
  const lastUpdated = assessments[0]?.updated_at;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Dashboard
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-bold">My Matches</h1>
        <p className="mt-1 text-muted-foreground">
          Grants scored against your profile, ranked by eligibility.
          {totalScored > 0 && (
            <> {totalScored} grants scored{lastUpdated && <> · Last updated {new Date(lastUpdated).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</>}.</>
          )}
        </p>
      </div>

      {completionScore < 50 && (
        <Card className="mb-6 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40">
          <CardContent className="flex items-center gap-3 py-4">
            <Building2 className="h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Profile completion: {completionScore}%
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Complete at least 50% of your profile to unlock full AI-powered matching.{" "}
                <Link href="/profile" className="font-medium underline">Complete profile</Link>
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {totalScored === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold">No scored grants yet</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              The eligibility pipeline runs daily at 8:30 AM in your timezone.
              Make sure your profile is at least 50% complete to start receiving matches.
            </p>
            <div className="mt-4 flex gap-2">
              <Link href="/profile">
                <Button variant="outline" size="sm">Complete Profile</Button>
              </Link>
              <Link href="/grants">
                <Button size="sm">Browse All Grants</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <EligibleGrantsList
          grants={allGrants}
          counts={{ suggested: suggestedCount, withinReach: withinReachCount, other: otherCount }}
        />
      )}
    </div>
  );
}
