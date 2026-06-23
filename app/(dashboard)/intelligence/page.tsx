import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveOrg } from "@/lib/auth";
import { fetchApplicationsNeedingOutcome } from "@/lib/outcome-feedback";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EligibilityNotificationPreferences } from "@/components/profile/eligibility-notification-preferences";
import {
  Brain,
  FileSearch,
  ClipboardCheck,
  Scale,
  Network,
  ArrowRight,
  BarChart3,
} from "lucide-react";

export default async function IntelligencePage() {
  const { orgId, profile: activeProfile } = await getActiveOrg();
  const supabase = getSupabaseAdmin();
  const pendingOutcomes = await fetchApplicationsNeedingOutcome(orgId);

  let appWithSnapshot: { filled_snapshot?: unknown } | null = null;
  const { data: byOrgId } = await supabase
    .from("Application")
    .select("id, filled_snapshot, status")
    .eq("organisationId", orgId)
    .not("filled_snapshot", "is", null)
    .order("createdAt", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (byOrgId) appWithSnapshot = byOrgId;
  if (!appWithSnapshot) {
    const { data: byOrgIdAlt } = await supabase
      .from("Application")
      .select("id, filled_snapshot, status")
      .eq("organisation_id", orgId)
      .not("filled_snapshot", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (byOrgIdAlt) appWithSnapshot = byOrgIdAlt;
  }
  const snapshot = (appWithSnapshot as { filled_snapshot?: { fields?: unknown[]; fileNames?: string[] } } | null)
    ?.filled_snapshot;
  const fieldCount = snapshot?.fields?.length ?? 0;
  const fileCount = snapshot?.fileNames?.length ?? 0;

  const [{ data: profile }, { data: outcomes }] = await Promise.all([
    supabase
      .from("BusinessProfile")
      .select("completionScore, websiteIntelligence, innovationCapabilities, socialImpact, keyAchievements, teamExpertise")
      .eq("id", activeProfile?.id ?? "")
      .eq("organisationId", orgId)
      .maybeSingle(),
    supabase
      .from("ApplicationOutcome")
      .select("outcome, awardedAmount")
      .eq("organisationId", orgId)
      .order("updatedAt", { ascending: false })
      .limit(20),
  ]);
  const outcomeRows = (outcomes ?? []) as { outcome?: string; awardedAmount?: number | null }[];
  const awardedCount = outcomeRows.filter((row) => row.outcome === "awarded").length;
  const shortlistedCount = outcomeRows.filter((row) => row.outcome === "shortlisted").length;
  const totalOutcomes = outcomeRows.length;
  const dnaSignals = [
    (profile as { websiteIntelligence?: string | null } | null)?.websiteIntelligence,
    (profile as { innovationCapabilities?: string | null } | null)?.innovationCapabilities,
    (profile as { socialImpact?: string | null } | null)?.socialImpact,
    (profile as { keyAchievements?: string | null } | null)?.keyAchievements,
    (profile as { teamExpertise?: string | null } | null)?.teamExpertise,
  ].filter((value) => typeof value === "string" && value.trim().length > 0).length;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Grants-Copilot Intelligence</h1>
        <p className="mt-1 text-muted-foreground">
          Vertical depth that general assistants can&apos;t replicate: company DNA, eligibility decisions,
          preparation documents, grant knowledge, and outcome learning.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSearch className="h-5 w-5" />
              Structured form intelligence
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              We map grant requirements against your profile and documents so you can prepare answers,
              check evidence gaps, and apply on the funder site with fewer surprises.
            </p>
            {fieldCount > 0 && (
              <p className="text-xs text-muted-foreground">
                Last run: {fieldCount} fields and {fileCount} file(s) captured for review.
              </p>
            )}
            <Link href="/applications">
              <Button variant="outline" size="sm" className="gap-1">
                View applications <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck className="h-5 w-5" />
              Preparation workflow
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Track each grant from eligibility review to prep documents, funder-site submission,
              submitted status, and final outcome feedback.
            </p>
            <Link href="/grants">
              <Button variant="outline" size="sm" className="gap-1">
                Open grants <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Scale className="h-5 w-5" />
              Predictive funding scoring
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Per-grant funding fit, eligibility reasoning, evidence strength, and improvement plans. Scores are cached and shown on the grants list; we notify you for high-fit grants.
            </p>
            <Link href="/grants">
              <Button variant="outline" size="sm" className="gap-1">
                Open a grant and check eligibility <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Brain className="h-5 w-5" />
              Business DNA engine
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Your profile, website intelligence, grant memory, application answers, and evidence fields form a reusable company model for funding decisions.
            </p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-md border p-3">
                <p className="text-muted-foreground">Profile depth</p>
                <p className="text-lg font-semibold">{(profile as { completionScore?: number } | null)?.completionScore ?? 0}%</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-muted-foreground">DNA signals</p>
                <p className="text-lg font-semibold">{dnaSignals}/5</p>
              </div>
            </div>
            <Link href="/profile">
              <Button variant="outline" size="sm" className="gap-1">
                Improve company DNA <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-5 w-5" />
              Outcome learning loop
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Record awards, rejections, shortlist decisions, and funder feedback so GrantPilot learns which patterns improve future recommendations.
            </p>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="rounded-md border p-3">
                <p className="text-muted-foreground">Outcomes</p>
                <p className="text-lg font-semibold">{totalOutcomes}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-muted-foreground">Shortlisted</p>
                <p className="text-lg font-semibold">{shortlistedCount}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-muted-foreground">Awarded</p>
                <p className="text-lg font-semibold">{awardedCount}</p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Link href="/applications/outcomes">
                <Button variant="default" size="sm" className="gap-1">
                  Outcome queue
                  {pendingOutcomes.length > 0 ? ` (${pendingOutcomes.length})` : ""}{" "}
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
              <Link href="/applications">
                <Button variant="outline" size="sm" className="gap-1">
                  All applications <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
            {pendingOutcomes.length > 0 && (
              <ul className="text-xs text-muted-foreground">
                {pendingOutcomes.slice(0, 4).map((p) => (
                  <li key={p.applicationId}>
                    <Link href={`/applications/${p.applicationId}`} className="font-medium text-primary hover:underline">
                      {p.grantName}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <EligibilityNotificationPreferences />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Network className="h-5 w-5" />
              Grant knowledge
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Grants by funder, similar grants by sector and amount, and GrantsCopilot matching so you see
              the best-fit opportunities first. More structure coming: funder graph, requirements graph.
            </p>
            <Link href="/grants">
              <Button variant="outline" size="sm" className="gap-1">
                Browse & match grants <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-8 border-primary/20 bg-primary/5">
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center sm:flex-row sm:justify-center sm:text-left">
          <Brain className="h-10 w-10 text-primary" />
          <div>
            <p className="font-medium">
              What this page shows you
            </p>
            <p className="text-sm text-muted-foreground">
              Here you see how Grants-Copilot works under the hood: form parsing and field mapping,
              per-grant eligibility scores and improvement tips, and GrantsCopilot matching so you
              can focus on the best-fit grants first.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
