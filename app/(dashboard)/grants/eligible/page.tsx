import Link from "next/link";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { grantMatchesFunderLocations } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, Target, ArrowLeft, ArrowRight, Building2 } from "lucide-react";
import { EligibleGrantCard, type EligibleGrant } from "@/components/grants/eligible-grant-card";

export default async function EligibleGrantsPage() {
  const { org, orgId } = await getActiveOrg();
  const supabase = getSupabaseAdmin();

  const profile = org.profiles?.[0];
  const completionScore = profile?.completionScore ?? 0;
  const profileId = profile?.id;

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

  const { data: assessmentsData } = await supabase
    .from("EligibilityAssessment")
    .select("grant_id, score, decision, summary, missing_criteria, improvement_plan, updated_at")
    .eq("organisation_id", orgId)
    .eq("profile_id", profileId)
    .order("score", { ascending: false });

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
    const { data: grantsData } = await supabase
      .from("Grant")
      .select("id, name, funder, deadline, funderLocations, url_status")
      .in("id", grantIds);

    const validGrants = (grantsData ?? []).filter(
      (g: { url_status?: string }) => (g.url_status ?? "unknown") !== "dead" && (g.url_status ?? "unknown") !== "expired"
    ) as { id: string; name: string; funder: string; deadline: string | null; funderLocations?: string[] }[];

    const userFunderLocations = (profile as { funderLocations?: string[] }).funderLocations;
    const locationFiltered = validGrants.filter((g) =>
      grantMatchesFunderLocations(g.funderLocations, userFunderLocations)
    );
    grantsMap = new Map(locationFiltered.map((g) => [g.id, g]));
  }

  const suggested: EligibleGrant[] = [];
  const withinReach: EligibleGrant[] = [];
  const other: EligibleGrant[] = [];

  for (const a of assessments) {
    const grant = grantsMap.get(a.grant_id);
    if (!grant) continue;

    const item: EligibleGrant = {
      grantId: a.grant_id,
      grantName: grant.name,
      funder: grant.funder,
      deadline: grant.deadline,
      score: a.score,
      decision: a.decision,
      summary: a.summary,
      missingCriteria: a.missing_criteria,
      improvementPlan: a.improvement_plan,
    };

    if (a.score >= 80) suggested.push(item);
    else if (a.score >= 50) withinReach.push(item);
    else other.push(item);
  }

  const totalScored = suggested.length + withinReach.length + other.length;
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

      <div className="flex flex-wrap gap-3 mb-6">
        <Badge variant="default" className="gap-1">
          <Sparkles className="h-3 w-3" />
          {suggested.length} suggested
        </Badge>
        <Badge variant="secondary" className="gap-1">
          <Target className="h-3 w-3" />
          {withinReach.length} within reach
        </Badge>
        <Badge variant="outline">
          {other.length} other
        </Badge>
      </div>

      {totalScored === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Sparkles className="h-10 w-10 text-muted-foreground" />
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
        <div className="space-y-8">
          {suggested.length > 0 && (
            <section>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Suggested for you
                  </CardTitle>
                  <p className="text-sm font-normal text-muted-foreground">
                    High eligibility — these grants are a strong fit for your business.
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {suggested.map((g) => (
                    <EligibleGrantCard key={g.grantId} grant={g} />
                  ))}
                </CardContent>
              </Card>
            </section>
          )}

          {withinReach.length > 0 && (
            <section>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Target className="h-4 w-4 text-amber-600" />
                    Within reach
                  </CardTitle>
                  <p className="text-sm font-normal text-muted-foreground">
                    Partial fit — see what you can do to improve your eligibility.
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {withinReach.map((g) => (
                    <EligibleGrantCard key={g.grantId} grant={g} />
                  ))}
                </CardContent>
              </Card>
            </section>
          )}

          {other.length > 0 && (
            <section>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base text-muted-foreground">
                    Other scored grants
                  </CardTitle>
                  <p className="text-sm font-normal text-muted-foreground">
                    Lower fit — these may still be worth reviewing.
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {other.map((g) => (
                    <EligibleGrantCard key={g.grantId} grant={g} />
                  ))}
                </CardContent>
              </Card>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
