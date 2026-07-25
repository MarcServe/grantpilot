import Link from "next/link";
import { Suspense } from "react";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveOrg } from "@/lib/auth";
import { grantMatchesFunderLocations, inferFunderLocationsFromProfile } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  Search,
  FileText,
  ArrowRight,
  Sparkles,
  Target,
  ListTodo,
  ClipboardCheck,
  Gauge,
  Bot,
  Bell,
  ChevronRight,
} from "lucide-react";
import { ApplicationCardWithDelete } from "@/components/dashboard/application-card-with-delete";
import { DashboardNotificationChannels } from "@/components/dashboard/notification-channels-card";
import { OutcomeFeedbackBanner } from "@/components/dashboard/outcome-feedback-banner";
import { BusinessDnaMatchHealth } from "@/components/profile/business-dna-match-health";
import { getAppliedGrantIds } from "@/lib/applied-grants";
import { fetchApplicationsNeedingOutcome, applicationNeedsOutcomeReminder } from "@/lib/outcome-feedback";
import { isOpenAIChecked } from "@/lib/grant-source-policy";
import { getSuppressedGrantIds } from "@/lib/grant-user-state";
import { applyEligibilityScoreGuards } from "@/lib/eligibility-score-guards";
import { applyOutcomeScoreAdjustment, deriveOutcomeLearningAdvisory } from "@/lib/outcome-learning";
import { getMatchHealthReport } from "@/lib/match-health";
import { fetchCachedGrantRowsByIds } from "@/lib/grant-record-cache";
import { planAllowsForOrg } from "@/lib/plan-features";
import {
  formatGrantValue,
  formatGrantValueSummary,
  grantValueSummaryDetail,
  summarizeGrantValues,
  type GrantValueSummary,
} from "@/lib/grant-value";
import type { EligibilityResult } from "@/lib/claude";

const DASHBOARD_MATCH_PREVIEW_LIMIT = 80;
const GRANT_QUERY_BATCH_SIZE = 24;
const DASHBOARD_MATCH_HEALTH_LIMIT = 80;

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;
type DashboardMatchGrant = {
  grantId: string;
  grantName: string;
  score: number;
  amount?: number | null;
  summary?: string;
  addedAt?: string | null;
};
type DeferredGrant = { grantId: string; grantName: string; funder: string; score?: number; updatedAt?: string | null };
type DashboardMatchesData = {
  suggestedGrants: DashboardMatchGrant[];
  withinReachGrants: DashboardMatchGrant[];
  deferredGrants: DeferredGrant[];
};

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

async function loadDashboardMatches({
  supabase,
  orgId,
  profile,
  completionScore,
}: {
  supabase: SupabaseAdmin;
  orgId: string;
  profile?: ({ id: string } & Record<string, unknown>) | null;
  completionScore: number;
}): Promise<DashboardMatchesData> {
  const suggestedGrants: DashboardMatchGrant[] = [];
  const withinReachGrants: DashboardMatchGrant[] = [];
  let deferredGrants: DeferredGrant[] = [];

  if (!profile || completionScore < 50) {
    return { suggestedGrants, withinReachGrants, deferredGrants };
  }

  const [
    appliedGrantIds,
    suppressedGrantIds,
    assessmentsResult,
    outcomeRowsResult,
  ] = await Promise.all([
    getAppliedGrantIds(supabase, orgId, profile.id),
    getSuppressedGrantIds(supabase, orgId, profile.id),
    supabase
      .from("EligibilityAssessment")
      .select("grant_id, score, decision, summary, missing_criteria, improvement_plan, scoring_source")
      .eq("organisation_id", orgId)
      .eq("profile_id", profile.id)
      .order("score", { ascending: false })
      .limit(DASHBOARD_MATCH_PREVIEW_LIMIT),
    supabase
      .from("ApplicationOutcome")
      .select("outcome, awardedAmount, funderFeedback, learningNotes, Grant(name, funder)")
      .eq("organisationId", orgId)
      .eq("profileId", profile.id)
      .order("reportedAt", { ascending: false })
      .limit(3),
  ]);
  const assessments = assessmentsResult.data ?? [];
  const grantIds = [
    ...new Set((assessments as { grant_id: string; score: number; summary: string | null; scoring_source?: string | null }[]).map((a) => a.grant_id)),
  ];

  if (grantIds.length > 0) {
    const grantById = await fetchCachedGrantRowsByIds<{
      id: string;
      name: string;
      funderLocations?: string[];
      amount?: number | null;
      createdAt?: string | null;
      eligibility?: string | null;
      description?: string | null;
      objectives?: string | null;
      applicantTypes?: string[];
      sectors?: string[];
      regions?: string[];
    }>({
      supabase,
      ids: grantIds,
      select: "id, name, amount, funderLocations, createdAt, eligibility, description, objectives, applicantTypes, sectors, regions",
      batchSize: GRANT_QUERY_BATCH_SIZE,
      ttlMs: 60_000,
      cacheNamespace: "dashboard-grants",
    });
    const grantsList = [...grantById.values()];
    const userFunderLocations = inferFunderLocationsFromProfile(profile as {
      funderLocations?: string[] | null;
      location?: string | null;
      country?: string | null;
      region?: string | null;
    });
    const matchesLocation = new Set(grantsList.filter((g) => grantMatchesFunderLocations(g.funderLocations, userFunderLocations)).map((g) => g.id));
    const outcomeAdvisory = deriveOutcomeLearningAdvisory(outcomeRowsResult.data ?? []);
    for (const a of assessments as { grant_id: string; score: number; decision?: string | null; summary: string | null; missing_criteria?: string[] | null; improvement_plan?: { gaps?: string[]; actions?: string[]; timeline?: string } | null; scoring_source?: string | null }[]) {
      if (appliedGrantIds.has(a.grant_id)) continue;
      if (suppressedGrantIds.has(a.grant_id)) continue;
      if (!matchesLocation.has(a.grant_id)) continue;
      const grant = grantById.get(a.grant_id);
      const name = grant?.name ?? "Grant";
      const source = a.scoring_source ?? (a.summary?.startsWith("Preliminary fit") ? "heuristic" : "openai");
      const baseScore = source === "heuristic" ? Math.min(a.score, 69) : a.score;
      const guarded = grant
        ? applyOutcomeScoreAdjustment(applyEligibilityScoreGuards(
            profileForEligibilityGuards(profile as Record<string, unknown>),
            grant,
            {
              decision: a.decision === "likely_eligible" || a.decision === "review" || a.decision === "unlikely" ? a.decision : "review",
              reason: a.summary ?? "",
              confidence: baseScore,
              score: baseScore,
              summary: a.summary ?? undefined,
              reasons: [],
              improvementPlan: a.improvement_plan as EligibilityResult["improvementPlan"],
              met: [],
              missing: a.missing_criteria ?? [],
              winProbability: baseScore,
              evidenceStrength: baseScore >= 85 ? "strong" : baseScore >= 55 ? "medium" : "weak",
            }
          ), outcomeAdvisory)
        : null;
      const score = guarded ? (guarded.score ?? guarded.confidence) : baseScore;
      if (isOpenAIChecked(source) && score >= 85) {
        suggestedGrants.push({
          grantId: a.grant_id,
          grantName: name,
          score,
          amount: grant?.amount ?? null,
          addedAt: grant?.createdAt ?? null,
        });
      } else if (score >= 50) {
        withinReachGrants.push({
          grantId: a.grant_id,
          grantName: name,
          score,
          amount: grant?.amount ?? null,
          summary: guarded?.summary ?? a.summary ?? undefined,
          addedAt: grant?.createdAt ?? null,
        });
      }
    }
  }

  const { data: deferredRows } = await supabase
    .from("SavedGrant")
    .select("grant_id, updated_at, Grant(id, name, funder)")
    .eq("organisation_id", orgId)
    .eq("profile_id", profile.id)
    .eq("status", "deferred")
    .order("updated_at", { ascending: false })
    .limit(5);
  const deferredIds = (deferredRows ?? []).map((row: { grant_id: string }) => row.grant_id);
  const scoreByGrant = new Map<string, number>();
  if (deferredIds.length > 0) {
    const { data: deferredAssessments } = await supabase
      .from("EligibilityAssessment")
      .select("grant_id, score")
      .eq("organisation_id", orgId)
      .eq("profile_id", profile.id)
      .in("grant_id", deferredIds);
    for (const row of deferredAssessments ?? []) {
      const r = row as { grant_id: string; score?: number };
      if (typeof r.score === "number") scoreByGrant.set(r.grant_id, r.score);
    }
  }
  deferredGrants = (deferredRows ?? []).map((row) => {
    const r = row as {
      grant_id: string;
      updated_at?: string | null;
      Grant?: { name?: string; funder?: string } | { name?: string; funder?: string }[];
    };
    const grant = Array.isArray(r.Grant) ? r.Grant[0] : r.Grant;
    return {
      grantId: r.grant_id,
      grantName: grant?.name ?? "Grant",
      funder: grant?.funder ?? "Funder",
      score: scoreByGrant.get(r.grant_id),
      updatedAt: r.updated_at ?? null,
    };
  });

  return { suggestedGrants, withinReachGrants, deferredGrants };
}

export default async function DashboardPage() {
  const { org, orgId, user } = await getActiveOrg();
  const rawUser = user as Record<string, unknown> | undefined;
  const phoneNumber = (rawUser?.phoneNumber ?? rawUser?.phone_number) as string | null | undefined;
  const hasPhone = Boolean(phoneNumber && String(phoneNumber).trim().length >= 10);
  const whatsappOptIn = Boolean(rawUser?.whatsappOptIn ?? rawUser?.whatsapp_opt_in);
  const whatsappAlertsEnabled = planAllowsForOrg(
    org,
    "whatsapp_opportunity_alerts"
  );

  const supabase = getSupabaseAdmin();

  const profile = org.profiles?.[0];
  const completionScore = profile?.completionScore ?? 0;

  const [
    recentApplicationsResult,
    totalApplicationsResult,
    activeApplicationsResult,
    submittedApplicationsResult,
    upcomingTasksResult,
    latestAssessmentResult,
    eligibilityCountResult,
    pendingOutcomes,
    outcomeRowsForRecent,
  ] = await Promise.all([
    supabase
      .from("Application")
      .select("*, Grant(*)")
      .eq("organisationId", orgId)
      .order("createdAt", { ascending: false })
      .limit(5),
    supabase
      .from("Application")
      .select("id", { count: "exact", head: true })
      .eq("organisationId", orgId),
    supabase
      .from("Application")
      .select("id", { count: "exact", head: true })
      .eq("organisationId", orgId)
      .in("status", ["FILLING", "REVIEW_REQUIRED"]),
    supabase
      .from("Application")
      .select("id", { count: "exact", head: true })
      .eq("organisationId", orgId)
      .in("status", ["SUBMITTED", "APPROVED"]),
    supabase
      .from("ApplicationTask")
      .select("id, name, status, dueDate, applicationId, grantId")
      .eq("organisationId", orgId)
      .neq("status", "done")
      .neq("status", "cancelled")
      .order("dueDate", { ascending: true, nullsFirst: false })
      .limit(8),
    supabase
      .from("EligibilityAssessment")
      .select("updated_at")
      .eq("organisation_id", orgId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("EligibilityAssessment")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", orgId),
    fetchApplicationsNeedingOutcome(orgId),
    supabase
      .from("ApplicationOutcome")
      .select("applicationId, outcome")
      .eq("organisationId", orgId)
      .order("updatedAt", { ascending: false })
      .limit(20),
  ]);
  const recentApplications = recentApplicationsResult.data ?? [];
  const totalApplications = totalApplicationsResult.count ?? 0;
  const activeApplications = activeApplicationsResult.count ?? 0;
  const submittedApplications = submittedApplicationsResult.count ?? 0;
  const upcomingTasksData = upcomingTasksResult.data ?? [];
  const taskRows = (upcomingTasksData ?? []) as { id: string; name: string; status: string; dueDate: string | null; applicationId: string; grantId: string | null }[];
  const grantIdsFromTasks = [...new Set(taskRows.map((t) => t.grantId).filter(Boolean))] as string[];
  const grantNameById: Record<string, string> = {};
  if (grantIdsFromTasks.length > 0) {
    const { data: grantRows } = await supabase
      .from("Grant")
      .select("id, name")
      .in("id", grantIdsFromTasks);
    for (const g of grantRows ?? []) {
      grantNameById[(g as { id: string }).id] = (g as { name: string }).name;
    }
  }
  const upcomingTasks = taskRows.map((t) => ({
    id: t.id,
    name: t.name,
    status: t.status,
    dueDate: t.dueDate,
    applicationId: t.applicationId,
    grantName: t.grantId ? grantNameById[t.grantId] ?? null : null,
  }));

  const appsWithGrant = (recentApplications ?? []).map(
    (app: { Grant?: { name: string; funder: string }; createdAt: string; id: string; status: string; stopped_at?: string; stoppedAt?: string }) => {
      const stoppedAt = app.stopped_at ?? app.stoppedAt;
      const displayStatus = app.status === "FAILED" && stoppedAt ? "STOPPED" : app.status;
      return {
        ...app,
        grant: app.Grant ?? { name: "", funder: "" },
        createdAt: app.createdAt,
        displayStatus,
      };
    }
  );

  let lastEligibilityRun: string | null = null;
  let eligibilityGrantCount = 0;
  if (latestAssessmentResult.data?.updated_at) {
    lastEligibilityRun = latestAssessmentResult.data.updated_at as string;
  }
  eligibilityGrantCount = eligibilityCountResult.count ?? 0;
  const matchesPromise = loadDashboardMatches({
    supabase,
    orgId,
    profile: profile as ({ id: string } & Record<string, unknown>) | undefined,
    completionScore,
  });
  const matchHealthPromise = loadDashboardMatchHealth({
    supabase,
    orgId,
    profile: profile as (Record<string, unknown> & { id: string }) | undefined,
  });

  const displayName =
    profile?.businessName?.trim() ||
    org.name?.trim() ||
    (String(rawUser?.name ?? rawUser?.fullName ?? rawUser?.email ?? "there")
      .split("@")[0]
      .replace(/[._-]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase()) || "there");
  const totalCount = totalApplications ?? 0;
  const activeCount = activeApplications ?? 0;
  const submittedCount = submittedApplications ?? 0;
  const draftCount = Math.max(totalCount - activeCount - submittedCount, 0);
  const successRate = totalCount > 0 ? Math.round((submittedCount / totalCount) * 100) : 0;
  const outcomeByApplicationId = new Map<string, string>();
  for (const row of outcomeRowsForRecent.data ?? []) {
    const r = row as { applicationId?: string; outcome?: string };
    if (r.applicationId && r.outcome) outcomeByApplicationId.set(r.applicationId, r.outcome);
  }

  return (
    <div className="min-w-0 space-y-6 sm:space-y-7">
      <OutcomeFeedbackBanner pending={pendingOutcomes} />
      <section className="overflow-hidden rounded-[26px] bg-white shadow-[0_24px_70px_rgba(7,26,58,0.08)]">
        <div className="grid min-w-0 gap-0 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="@container/main min-w-0 p-4 sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="break-words text-[28px] font-black leading-tight tracking-normal text-[#071a3a] sm:text-[32px]">
                  Welcome back,
                  <br className="hidden sm:block" /> {displayName}! 👋
                </h1>
                <p className="mt-2 text-sm font-medium text-[#51627d]">
                  Here&apos;s your funding overview
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[#e2eaf5] text-[#071a3a]">
                  <Bell className="h-5 w-5" />
                </span>
                <span className="flex h-11 w-11 rounded-full bg-[linear-gradient(135deg,#2468e8,#35c386)]" />
              </div>
            </div>

            <div className="mt-8 grid min-w-0 grid-cols-1 gap-4 @min-[520px]/main:grid-cols-2 @min-[920px]/main:grid-cols-4">
              <MetricCard
                icon={Search}
                label="Opportunities"
                value={eligibilityGrantCount}
                detail="Scored grants"
                tone="blue"
                href="/grants/eligible"
              />
              <MetricCard
                icon={FileText}
                label="In Progress"
                value={activeCount}
                detail="Applications"
                tone="green"
                href="/applications?status=in_progress"
              />
              <MetricCard
                icon={ClipboardCheck}
                label="Submitted"
                value={submittedCount}
                detail="Applications"
                tone="purple"
                href="/applications?status=submitted"
              />
              <MetricCard
                icon={Gauge}
                label="Success Rate"
                value={`${successRate}%`}
                detail={totalCount > 0 ? "Submitted ratio" : "No submissions yet"}
                tone="mint"
                href="/applications"
              />
            </div>

            <div className="mt-5">
              <Suspense fallback={<DashboardFundingSnapshotSkeleton />}>
                <DashboardFundingSnapshot matchesPromise={matchesPromise} />
              </Suspense>
            </div>

            <div className="mt-5 grid min-w-0 grid-cols-1 gap-5 @min-[680px]/main:grid-cols-2">
              <Suspense fallback={<TopMatchedOpportunitiesSkeleton />}>
                <TopMatchedOpportunities matchesPromise={matchesPromise} />
              </Suspense>

              <div className="@container/progress min-w-0 rounded-2xl border border-[#e7edf6] bg-white p-4 shadow-[0_14px_36px_rgba(7,26,58,0.06)] sm:p-5">
                <h2 className="text-lg font-black text-[#071a3a]">Application Progress</h2>
                <div className="mt-6 flex flex-col items-center gap-6 @min-[320px]/progress:flex-row @min-[320px]/progress:flex-wrap @min-[320px]/progress:justify-center">
                  <div className="grid h-36 w-36 shrink-0 place-items-center rounded-full bg-[conic-gradient(#2167e8_0_42%,#35c386_42%_73%,#4bc7ad_73%_100%)] sm:h-40 sm:w-40">
                    <div className="grid h-24 w-24 place-items-center rounded-full bg-white text-center shadow-inner">
                      <div>
                        <p className="text-3xl font-black leading-none text-[#071a3a]">{activeCount}</p>
                        <p className="mt-1 text-xs font-bold text-[#51627d]">In Progress</p>
                      </div>
                    </div>
                  </div>
                  <div className="w-full min-w-0 max-w-[260px] space-y-4 text-sm font-extrabold text-[#071a3a]">
                    <ProgressLegend color="bg-[#2167e8]" label="Draft" value={draftCount} />
                    <ProgressLegend color="bg-[#4bc7ad]" label="In Review" value={activeCount} />
                    <ProgressLegend color="bg-[#35c386]" label="Submitted" value={submittedCount} />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-5 rounded-2xl bg-[#e7f1ff] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div>
                <p className="text-xl font-black leading-snug text-[#071a3a]">
                  Save time. Increase success.
                  <br /> Get funded.
                </p>
                <p className="mt-3 max-w-xl text-sm font-medium leading-6 text-[#2a4065]">
                  GrantsCopilot handles discovery, scoring, drafting, and preparation workflows so you can focus on growing your business.
                </p>
              </div>
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-[#d6e8ff] text-[#2167e8]">
                <Bot className="h-10 w-10" />
              </div>
            </div>
          </div>

          <div className="min-w-0 border-t border-[#e7edf6] bg-[linear-gradient(180deg,#eef6ff,#ffffff)] p-4 sm:p-6 xl:border-l xl:border-t-0">
            <div className="rounded-2xl border border-[#dbe7f6] bg-white p-5 shadow-[0_14px_36px_rgba(7,26,58,0.06)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-[#51627d]">Business DNA</p>
                  <p className="mt-1 text-3xl font-black text-[#071a3a]">{completionScore}%</p>
                </div>
                <Building2 className="h-8 w-8 text-[#2167e8]" />
              </div>
              <div className="mt-5 h-2.5 rounded-full bg-[#e6edf7]">
                <div className="h-full rounded-full bg-[#35c386]" style={{ width: `${completionScore}%` }} />
              </div>
              <p className="mt-3 text-sm font-semibold text-[#51627d]">
                {completionScore >= 100 ? "Profile complete" : "Complete your profile to improve match quality"}
              </p>
              {completionScore < 100 && (
                <Link href="/profile" className="mt-4 inline-flex text-sm font-extrabold text-[#2167e8]">
                  Improve profile <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              )}
            </div>

            <DashboardNotificationChannels
              initialWhatsappOptIn={whatsappOptIn}
              initialHasPhone={hasPhone}
              whatsappAlertsEnabled={whatsappAlertsEnabled}
              preferredTimezone={(org as { preferredTimezone?: string | null }).preferredTimezone ?? null}
              lastEligibilityRun={lastEligibilityRun}
              eligibilityGrantCount={eligibilityGrantCount}
            />
          </div>
        </div>
      </section>

      <Suspense fallback={null}>
        <DashboardBusinessDnaPrompt
          matchHealthPromise={matchHealthPromise}
          profile={profile as Record<string, unknown> | undefined}
        />
      </Suspense>

      {upcomingTasks.length > 0 && (
        <Card className="rounded-2xl border-[#e1eaf6] bg-white shadow-[0_18px_45px_rgba(7,26,58,0.07)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ListTodo className="h-4 w-4 text-primary" />
              Upcoming tasks
            </CardTitle>
            <p className="text-sm font-normal text-muted-foreground">
              Next steps for your active applications. Click a task to open that application and mark it done.
            </p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {upcomingTasks.slice(0, 5).map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/applications/${t.applicationId}`}
                    className="flex flex-col gap-0.5 rounded-md p-2 hover:bg-muted sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="font-medium">{t.name}{t.grantName ? ` — ${t.grantName}` : ""}</span>
                    {t.dueDate && (
                      <span className="text-xs text-muted-foreground">
                        Due {new Date(t.dueDate).toLocaleDateString("en-GB")}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/applications" className="mt-3 inline-block text-sm text-primary hover:underline">
              View all applications <ArrowRight className="inline h-3 w-3" />
            </Link>
          </CardContent>
        </Card>
      )}

      <Suspense fallback={null}>
        <DashboardMatchSections matchesPromise={matchesPromise} />
      </Suspense>

      <div className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent Applications</h2>
          {(totalApplications ?? 0) > 0 && (
            <Link href="/applications">
              <Button variant="ghost" size="sm">
                View All
              </Button>
            </Link>
          )}
        </div>

        {appsWithGrant.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-10 w-10 text-muted-foreground" />
              <h3 className="mt-4 font-medium">No applications yet</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Open the Grant Library to browse all current grants, or use My Matches for personalised AI-scored recommendations.
              </p>
              <Link href="/grants" className="mt-4">
                <Button size="sm">Open Grant Library</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {appsWithGrant.map((app) => (
              <ApplicationCardWithDelete
                key={app.id}
                id={app.id}
                grantName={app.grant.name}
                funder={app.grant.funder}
                displayStatus={app.displayStatus}
                createdAt={app.createdAt}
                needsOutcomeReminder={
                  ["SUBMITTED", "APPROVED"].includes(app.status) &&
                  applicationNeedsOutcomeReminder(outcomeByApplicationId.get(app.id))
                }
                canMarkSubmitted={!["SUBMITTED", "APPROVED"].includes(app.status)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

async function loadDashboardMatchHealth({
  supabase,
  orgId,
  profile,
}: {
  supabase: SupabaseAdmin;
  orgId: string;
  profile?: (Record<string, unknown> & { id: string }) | null;
}) {
  if (!profile?.id) return null;
  return getMatchHealthReport({
    supabase,
    orgId,
    profile,
    assessmentLimit: DASHBOARD_MATCH_HEALTH_LIMIT,
  });
}

async function DashboardBusinessDnaPrompt({
  matchHealthPromise,
  profile,
}: {
  matchHealthPromise: Promise<Awaited<ReturnType<typeof loadDashboardMatchHealth>>>;
  profile?: Record<string, unknown>;
}) {
  const matchHealth = await matchHealthPromise;
  if (!matchHealth || !profile) return null;
  return <BusinessDnaMatchHealth report={matchHealth} profile={profile} />;
}

async function DashboardFundingSnapshot({ matchesPromise }: { matchesPromise: Promise<DashboardMatchesData> }) {
  const { suggestedGrants, withinReachGrants } = await matchesPromise;
  const suggestedValue = summarizeGrantValues(suggestedGrants);
  const withinReachValue = summarizeGrantValues(withinReachGrants);
  const totalValue = summarizeGrantValues([...suggestedGrants, ...withinReachGrants]);

  return (
    <div className="grid min-w-0 gap-3 lg:grid-cols-3">
      <FundingSnapshotCard
        label="Matched funding value"
        summary={totalValue}
        detail="Strong + within-reach opportunities"
        tone="blue"
      />
      <FundingSnapshotCard
        label="Strong match value"
        summary={suggestedValue}
        detail="85%+ AI-scored matches"
        tone="green"
      />
      <FundingSnapshotCard
        label="Within reach value"
        summary={withinReachValue}
        detail="Near matches worth reviewing"
        tone="amber"
      />
    </div>
  );
}

function FundingSnapshotCard({
  label,
  summary,
  detail,
  tone,
}: {
  label: string;
  summary: GrantValueSummary;
  detail: string;
  tone: "blue" | "green" | "amber";
}) {
  const toneClass = {
    blue: "border-[#cfe1ff] bg-[#f2f7ff]",
    green: "border-[#cbeedc] bg-[#effcf6]",
    amber: "border-[#f5dfad] bg-[#fff8e8]",
  }[tone];

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <p className="text-xs font-black uppercase tracking-[0.08em] text-[#51627d]">{label}</p>
      <p className="mt-1 break-words text-3xl font-black leading-none tracking-tight text-[#071a3a]">
        {formatGrantValueSummary(summary)}
      </p>
      <p className="mt-2 text-xs font-bold text-[#51627d]">
        {detail} · {grantValueSummaryDetail(summary)}
      </p>
    </div>
  );
}

function DashboardFundingSnapshotSkeleton() {
  return (
    <div className="grid min-w-0 gap-3 lg:grid-cols-3" aria-hidden="true">
      {[0, 1, 2].map((item) => (
        <div key={item} className="rounded-2xl border border-[#e7edf6] bg-white px-4 py-3">
          <div className="h-3 w-32 animate-pulse rounded bg-[#eef3f8]" />
          <div className="mt-3 h-8 w-36 animate-pulse rounded bg-[#eef3f8]" />
          <div className="mt-3 h-3 w-48 max-w-full animate-pulse rounded bg-[#eef3f8]" />
        </div>
      ))}
    </div>
  );
}

async function TopMatchedOpportunities({ matchesPromise }: { matchesPromise: Promise<DashboardMatchesData> }) {
  const { suggestedGrants, withinReachGrants } = await matchesPromise;
  const topMatches = [...suggestedGrants, ...withinReachGrants].slice(0, 3);

  return (
    <div className="min-w-0 rounded-2xl border border-[#e7edf6] bg-white p-4 shadow-[0_14px_36px_rgba(7,26,58,0.06)] sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-black text-[#071a3a]">Top Matched Opportunities</h2>
        <Link href="/grants/eligible" className="text-sm font-extrabold text-[#2167e8]">
          View all
        </Link>
      </div>
      <div className="mt-4 divide-y divide-[#edf2f7]">
        {topMatches.length > 0 ? (
          topMatches.map((grant) => (
            <Link
              key={grant.grantId}
              href={`/grants/${grant.grantId}?from=dashboard`}
              className="flex min-w-0 items-center gap-3 py-4"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#edf5ff] text-[#2167e8]">
                <FileText className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-black text-[#071a3a]">
                  {grant.grantName}
                </span>
                <span className="mt-1 block text-xs font-semibold text-[#566984]">
                  AI-ranked funding opportunity
                  {grant.addedAt
                    ? ` · Added ${new Date(grant.addedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                    : ""}
                </span>
                <span className="mt-1 block text-xs font-black text-[#2167e8]">
                  {formatGrantValue(grant.amount)}
                </span>
              </span>
              <span className="shrink-0 rounded-lg bg-[#dff8ed] px-2.5 py-2 text-center text-xs font-black leading-none text-[#087f59] sm:px-3">
                {grant.score}%
                <br />
                <span className="text-[10px]">Match</span>
              </span>
              <ChevronRight className="h-4 w-4 text-[#9aabc1]" />
            </Link>
          ))
        ) : (
          <div className="flex flex-col items-start gap-3 py-8">
            <p className="text-sm font-semibold text-[#51627d]">
              Complete your profile and run eligibility scoring to surface your best funding matches.
            </p>
            <Link href="/grants">
              <Button size="sm" className="gap-2 rounded-lg bg-[#2167e8]">
                Open Grant Library <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function TopMatchedOpportunitiesSkeleton() {
  return (
    <div className="min-w-0 rounded-2xl border border-[#e7edf6] bg-white p-4 shadow-[0_14px_36px_rgba(7,26,58,0.06)] sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-black text-[#071a3a]">Top Matched Opportunities</h2>
        <Link href="/grants/eligible" className="text-sm font-extrabold text-[#2167e8]">
          View all
        </Link>
      </div>
      <div className="mt-4 space-y-4" aria-hidden="true">
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex items-center gap-3 py-1">
            <span className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-[#eef3f8]" />
            <span className="min-w-0 flex-1 space-y-2">
              <span className="block h-4 w-4/5 animate-pulse rounded bg-[#eef3f8]" />
              <span className="block h-3 w-3/5 animate-pulse rounded bg-[#eef3f8]" />
            </span>
            <span className="h-9 w-14 shrink-0 animate-pulse rounded-lg bg-[#eef3f8]" />
          </div>
        ))}
      </div>
    </div>
  );
}

async function DashboardMatchSections({ matchesPromise }: { matchesPromise: Promise<DashboardMatchesData> }) {
  const { suggestedGrants, withinReachGrants, deferredGrants } = await matchesPromise;
  const suggestedValue = summarizeGrantValues(suggestedGrants);
  const withinReachValue = summarizeGrantValues(withinReachGrants);

  return (
    <>
      {(suggestedGrants.length > 0 || withinReachGrants.length > 0) && (
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {suggestedGrants.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Suggested for you
                    </CardTitle>
                    <p className="text-sm font-normal text-muted-foreground">
                      High eligibility based on your profile. We&apos;ve notified you about these.
                    </p>
                  </div>
                  <MatchValueBadge summary={suggestedValue} />
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {suggestedGrants.slice(0, 5).map((g) => (
                    <li key={g.grantId}>
                      <Link
                        href={`/grants/${g.grantId}?from=dashboard`}
                        className="flex min-w-0 flex-col gap-2 rounded-md p-2 hover:bg-muted min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between"
                      >
                        <span className="min-w-0 break-words font-medium">{g.grantName}</span>
                        <Badge variant="default">{g.score}%</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link href="/grants/eligible" className="mt-3 inline-block text-sm text-primary hover:underline">
                  View all matches <ArrowRight className="inline h-3 w-3" />
                </Link>
              </CardContent>
            </Card>
          )}
          {withinReachGrants.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Target className="h-4 w-4 text-amber-600" />
                      Within reach
                    </CardTitle>
                    <p className="text-sm font-normal text-muted-foreground">
                      Partial fit. Open a grant to see how to improve your eligibility.
                    </p>
                  </div>
                  <MatchValueBadge summary={withinReachValue} />
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {withinReachGrants.slice(0, 5).map((g) => (
                    <li key={g.grantId}>
                      <Link
                        href={`/grants/${g.grantId}?from=dashboard`}
                        className="flex min-w-0 flex-col gap-2 rounded-md p-2 hover:bg-muted min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between"
                      >
                        <span className="min-w-0 break-words font-medium">{g.grantName}</span>
                        <Badge variant="secondary">{g.score}%</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link href="/grants/eligible" className="mt-3 inline-block text-sm text-primary hover:underline">
                  View all matches <ArrowRight className="inline h-3 w-3" />
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {deferredGrants.length > 0 && (
        <Card className="rounded-2xl border-[#e1eaf6] bg-white shadow-[0_18px_45px_rgba(7,26,58,0.07)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ListTodo className="h-4 w-4 text-primary" />
              Deferred for later
            </CardTitle>
            <p className="text-sm font-normal text-muted-foreground">
              Grants you chose to attend to later. These are excluded from repeated eligibility reminders.
            </p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {deferredGrants.map((g) => (
                <li key={g.grantId}>
                  <Link
                    href={`/grants/${g.grantId}?from=dashboard`}
                    className="flex min-w-0 flex-col gap-2 rounded-md p-2 hover:bg-muted min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{g.grantName}</span>
                      <span className="block truncate text-xs text-muted-foreground">{g.funder}</span>
                    </span>
                    {g.score != null && <Badge variant="secondary">{Math.round(g.score)}%</Badge>}
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/grants/eligible" className="mt-3 inline-block text-sm text-primary hover:underline">
              Review all grant matches <ArrowRight className="inline h-3 w-3" />
            </Link>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function MatchValueBadge({ summary }: { summary: GrantValueSummary }) {
  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2 text-left sm:text-right">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-blue-700">Estimated value</p>
      <p className="text-lg font-black leading-tight text-[#071a3a]">{formatGrantValueSummary(summary)}</p>
      <p className="text-[11px] font-medium text-muted-foreground">{grantValueSummaryDetail(summary)}</p>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
  href,
}: {
  icon: typeof Search;
  label: string;
  value: string | number;
  detail: string;
  tone: "blue" | "green" | "purple" | "mint";
  href: string;
}) {
  const toneClass = {
    blue: "bg-[#dfeaff] text-[#2167e8]",
    green: "bg-[#dff8ed] text-[#16a76e]",
    purple: "bg-[#eee5ff] text-[#7c4dff]",
    mint: "bg-[#d8fbf2] text-[#1aa685]",
  }[tone];

  const shellClass =
    "@container/metric block rounded-2xl border border-[#e7edf6] bg-white p-4 shadow-[0_14px_36px_rgba(7,26,58,0.06)] transition-colors hover:border-[#2167e8]/35 hover:shadow-[0_18px_44px_rgba(7,26,58,0.09)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2167e8] focus-visible:ring-offset-2";

  return (
    <Link href={href} className={shellClass}>
      <div className="flex flex-col gap-3 @[220px]/metric:flex-row @[220px]/metric:items-center @[220px]/metric:gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold leading-snug text-[#65748c]">{label}</p>
          <p className="mt-1 break-words text-2xl font-black leading-none tracking-tight text-[#071a3a]">{value}</p>
          <p className="mt-1 text-xs font-bold leading-snug text-[#071a3a]">{detail}</p>
        </div>
      </div>
    </Link>
  );
}

function ProgressLegend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="grid min-w-0 grid-cols-[14px_minmax(0,1fr)_28px] items-center gap-2">
      <span className={`h-3 w-3 shrink-0 rounded-full ${color}`} />
      <span className="min-w-0 break-words leading-snug">{label}</span>
      <span className="shrink-0 text-right tabular-nums">{value}</span>
    </div>
  );
}
