import Link from "next/link";
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
import { getAppliedGrantIds } from "@/lib/applied-grants";
import { fetchApplicationsNeedingOutcome, applicationNeedsOutcomeReminder } from "@/lib/outcome-feedback";
import { isOpenAIChecked } from "@/lib/grant-source-policy";

export default async function DashboardPage() {
  const { org, orgId, user } = await getActiveOrg();
  const rawUser = user as Record<string, unknown> | undefined;
  const phoneNumber = (rawUser?.phoneNumber ?? rawUser?.phone_number) as string | null | undefined;
  const hasPhone = Boolean(phoneNumber && String(phoneNumber).trim().length >= 10);
  const whatsappOptIn = Boolean(rawUser?.whatsappOptIn ?? rawUser?.whatsapp_opt_in);

  const supabase = getSupabaseAdmin();

  const profile = org.profiles?.[0];
  const completionScore = profile?.completionScore ?? 0;

  const { data: recentApplications = [] } = await supabase
    .from("Application")
    .select("*, Grant(*)")
    .eq("organisationId", orgId)
    .order("createdAt", { ascending: false })
    .limit(5);

  const { count: totalApplications } = await supabase
    .from("Application")
    .select("id", { count: "exact", head: true })
    .eq("organisationId", orgId);

  const { count: activeApplications } = await supabase
    .from("Application")
    .select("id", { count: "exact", head: true })
    .eq("organisationId", orgId)
    .in("status", ["FILLING", "REVIEW_REQUIRED"]);

  const { count: submittedApplications } = await supabase
    .from("Application")
    .select("id", { count: "exact", head: true })
    .eq("organisationId", orgId)
    .in("status", ["SUBMITTED", "APPROVED"]);

  const { data: upcomingTasksData = [] } = await supabase
    .from("ApplicationTask")
    .select("id, name, status, dueDate, applicationId, grantId")
    .eq("organisationId", orgId)
    .neq("status", "done")
    .neq("status", "cancelled")
    .order("dueDate", { ascending: true, nullsFirst: false })
    .limit(8);
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
  {
    const { data: latestAssessment } = await supabase
      .from("EligibilityAssessment")
      .select("updated_at")
      .eq("organisation_id", orgId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestAssessment?.updated_at) {
      lastEligibilityRun = latestAssessment.updated_at as string;
    }
    const { count } = await supabase
      .from("EligibilityAssessment")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", orgId);
    eligibilityGrantCount = count ?? 0;
  }

  const suggestedGrants: { grantId: string; grantName: string; score: number }[] = [];
  const withinReachGrants: { grantId: string; grantName: string; score: number; summary?: string }[] = [];
  if (profile && completionScore >= 50) {
    const appliedGrantIds = await getAppliedGrantIds(supabase, orgId, profile.id);
    const { data: assessmentsData } = await supabase
      .from("EligibilityAssessment")
      .select("grant_id, score, summary, scoring_source")
      .eq("organisation_id", orgId)
      .eq("profile_id", profile.id)
      .order("score", { ascending: false });
    const assessments = assessmentsData ?? [];
    const grantIds = (assessments as { grant_id: string; score: number; summary: string | null; scoring_source?: string | null }[]).map((a) => a.grant_id);
    if (grantIds.length > 0) {
      const BATCH = 200;
      const allGrantsList: { id: string; name: string; funderLocations?: string[] }[] = [];
      for (let i = 0; i < grantIds.length; i += BATCH) {
        const { data: batch } = await supabase
          .from("Grant")
          .select("id, name, funderLocations")
          .in("id", grantIds.slice(i, i + BATCH));
        if (batch) allGrantsList.push(...(batch as typeof allGrantsList));
      }
      const grantsList = allGrantsList;
      const userFunderLocations = inferFunderLocationsFromProfile(profile as {
        funderLocations?: string[] | null;
        location?: string | null;
        country?: string | null;
        region?: string | null;
      });
      const nameById = new Map(grantsList.map((g) => [g.id, g.name]));
      const matchesLocation = new Set(grantsList.filter((g) => grantMatchesFunderLocations(g.funderLocations, userFunderLocations)).map((g) => g.id));
      for (const a of assessments as { grant_id: string; score: number; summary: string | null; scoring_source?: string | null }[]) {
        if (appliedGrantIds.has(a.grant_id)) continue;
        if (!matchesLocation.has(a.grant_id)) continue;
        const name = nameById.get(a.grant_id) ?? "Grant";
        const source = a.scoring_source ?? (a.summary?.startsWith("Preliminary fit") ? "heuristic" : "openai");
        const score = source === "heuristic" ? Math.min(a.score, 69) : a.score;
        if (isOpenAIChecked(source) && score >= 80) suggestedGrants.push({ grantId: a.grant_id, grantName: name, score });
        else if (score >= 50) withinReachGrants.push({ grantId: a.grant_id, grantName: name, score, summary: a.summary ?? undefined });
      }
    }
  }

  const displayName =
    String(
      rawUser?.name ??
        rawUser?.fullName ??
        rawUser?.email ??
        "there"
    )
      .split("@")[0]
      .replace(/[._-]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase()) || "there";
  const totalCount = totalApplications ?? 0;
  const activeCount = activeApplications ?? 0;
  const submittedCount = submittedApplications ?? 0;
  const draftCount = Math.max(totalCount - activeCount - submittedCount, 0);
  const successRate = totalCount > 0 ? Math.round((submittedCount / totalCount) * 100) : 0;
  const qualifiedOpportunityCount = suggestedGrants.length + withinReachGrants.length;
  const topMatches = [...suggestedGrants, ...withinReachGrants].slice(0, 3);

  const [pendingOutcomes, outcomeRowsForRecent] = await Promise.all([
    fetchApplicationsNeedingOutcome(orgId),
    supabase.from("ApplicationOutcome").select("applicationId, outcome").eq("organisationId", orgId),
  ]);
  const outcomeByApplicationId = new Map<string, string>();
  for (const row of outcomeRowsForRecent.data ?? []) {
    const r = row as { applicationId?: string; outcome?: string };
    if (r.applicationId && r.outcome) outcomeByApplicationId.set(r.applicationId, r.outcome);
  }

  return (
    <div className="space-y-7">
      <OutcomeFeedbackBanner pending={pendingOutcomes} />
      <section className="overflow-hidden rounded-[26px] bg-white shadow-[0_24px_70px_rgba(7,26,58,0.08)]">
        <div className="grid min-w-0 gap-0 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="@container/main min-w-0 p-6 sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-[32px] font-black leading-tight tracking-normal text-[#071a3a]">
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
                value={qualifiedOpportunityCount || eligibilityGrantCount}
                detail={qualifiedOpportunityCount ? "Qualified matches" : "Scored grants"}
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

            <div className="mt-5 grid min-w-0 grid-cols-1 gap-5 @min-[680px]/main:grid-cols-2">
              <div className="min-w-0 rounded-2xl border border-[#e7edf6] bg-white p-5 shadow-[0_14px_36px_rgba(7,26,58,0.06)]">
                <div className="flex items-center justify-between">
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
                        href={`/grants/${grant.grantId}`}
                        className="flex items-center gap-3 py-4"
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
                          </span>
                        </span>
                        <span className="rounded-lg bg-[#dff8ed] px-3 py-2 text-center text-xs font-black leading-none text-[#087f59]">
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
                          Browse Grants <ArrowRight className="h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                  )}
                </div>
              </div>

              <div className="@container/progress min-w-0 rounded-2xl border border-[#e7edf6] bg-white p-5 shadow-[0_14px_36px_rgba(7,26,58,0.06)]">
                <h2 className="text-lg font-black text-[#071a3a]">Application Progress</h2>
                <div className="mt-6 flex flex-col items-center gap-6 @min-[320px]/progress:flex-row @min-[320px]/progress:flex-wrap @min-[320px]/progress:justify-center">
                  <div className="grid h-40 w-40 shrink-0 place-items-center rounded-full bg-[conic-gradient(#2167e8_0_42%,#35c386_42%_73%,#4bc7ad_73%_100%)]">
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

            <div className="mt-5 flex flex-col gap-5 rounded-2xl bg-[#e7f1ff] p-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xl font-black leading-snug text-[#071a3a]">
                  Save time. Increase success.
                  <br /> Get funded.
                </p>
                <p className="mt-3 max-w-xl text-sm font-medium leading-6 text-[#2a4065]">
                  GrantsCopilot handles discovery, scoring, drafting, and filing workflows so you can focus on growing your business.
                </p>
              </div>
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-[#d6e8ff] text-[#2167e8]">
                <Bot className="h-10 w-10" />
              </div>
            </div>
          </div>

          <div className="min-w-0 border-t border-[#e7edf6] bg-[linear-gradient(180deg,#eef6ff,#ffffff)] p-6 xl:border-l xl:border-t-0">
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
              preferredTimezone={(org as { preferredTimezone?: string | null }).preferredTimezone ?? null}
              lastEligibilityRun={lastEligibilityRun}
              eligibilityGrantCount={eligibilityGrantCount}
            />
          </div>
        </div>
      </section>

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

      {(suggestedGrants.length > 0 || withinReachGrants.length > 0) && (
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {suggestedGrants.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Suggested for you
                </CardTitle>
                <p className="text-sm font-normal text-muted-foreground">
                  High eligibility based on your profile. We&apos;ve notified you about these.
                </p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {suggestedGrants.slice(0, 5).map((g) => (
                    <li key={g.grantId}>
                      <Link
                        href={`/grants/${g.grantId}`}
                        className="flex items-center justify-between rounded-md p-2 hover:bg-muted"
                      >
                        <span className="font-medium">{g.grantName}</span>
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
                <CardTitle className="flex items-center gap-2 text-base">
                  <Target className="h-4 w-4 text-amber-600" />
                  Within reach
                </CardTitle>
                <p className="text-sm font-normal text-muted-foreground">
                  Partial fit. Open a grant to see how to improve your eligibility.
                </p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {withinReachGrants.slice(0, 5).map((g) => (
                    <li key={g.grantId}>
                      <Link
                        href={`/grants/${g.grantId}`}
                        className="flex items-center justify-between rounded-md p-2 hover:bg-muted"
                      >
                        <span className="font-medium">{g.grantName}</span>
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
                Browse grants and click Apply to get started.
              </p>
              <Link href="/grants" className="mt-4">
                <Button size="sm">Browse Grants</Button>
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
              />
            ))}
          </div>
        )}
      </div>
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
