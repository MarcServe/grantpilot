import Image from "next/image";
import { redirect } from "next/navigation";
import Link from "next/link";
import { isAdmin } from "@/lib/admin-auth";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  Database,
  Mail,
  MessageCircle,
  SearchCheck,
  ServerCrash,
  ShieldCheck,
  Users,
} from "lucide-react";
import { GrantImportUploader } from "@/components/admin/grant-import-uploader";
import { TestNotificationButton } from "@/components/admin/test-notification-button";
import { ScoutModeSettings } from "@/components/admin/scout-mode-settings";
import { GrantComposer } from "@/components/admin/grant-composer";

export const dynamic = "force-dynamic";

const OPS_NOTIFICATION_TYPES = [
  "grant_scan_digest",
  "grant_match_high",
  "daily_grant_update",
  "eligibility_upgrade_prompt",
  "deadline_reminder",
  "deadline_daily_update",
] as const;

type OpsNotificationType = (typeof OPS_NOTIFICATION_TYPES)[number];

type NotificationLogRow = {
  userId: string | null;
  channel: string | null;
  type: string | null;
  status: string | null;
  error: string | null;
  createdAt: string | null;
};

type GrantRow = {
  id: string;
  name: string | null;
  funder: string | null;
  source: string | null;
  deadline: string | null;
  createdAt: string | null;
};

type OrganisationMemberRow = {
  userId?: string | null;
  user_id?: string | null;
  organisationId?: string | null;
  organisation_id?: string | null;
};

type GrantSourceRow = {
  source_name: string | null;
  type: string | null;
  adapter: string | null;
  enabled: boolean | null;
  crawl_frequency: string | null;
  last_crawled_at: string | null;
};

type QueueStatus = {
  pending: number;
  crawled?: number;
  found?: number;
  manualReview?: number;
  failed: number;
};

type CronRunLogRow = {
  job_name: string | null;
  route: string | null;
  trigger: string | null;
  status: string | null;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
};

const NOTIFICATION_LABELS: Record<OpsNotificationType, string> = {
  grant_scan_digest: "Paid eligibility digest",
  grant_match_high: "WhatsApp high-match alert",
  daily_grant_update: "Daily scan email",
  eligibility_upgrade_prompt: "Upgrade prompt email",
  deadline_reminder: "Deadline reminder email",
  deadline_daily_update: "Deadline scan email",
};

const LONDON_DATE = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/London",
});

function formatDateTime(value?: string | null): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return LONDON_DATE.format(date);
}

function formatRelative(value?: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function formatDurationMs(value?: number | null): string {
  if (!value || value < 0) return "0ms";
  if (value < 1000) return `${value}ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds >= 10 ? 0 : 1)}s`;
  const minutes = seconds / 60;
  return `${minutes.toFixed(minutes >= 10 ? 0 : 1)}m`;
}

function isSince(value: string | null | undefined, since: Date): boolean {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time >= since.getTime();
}

function intervalToMs(value?: string | null): number {
  const match = String(value ?? "24h").match(/^(\d+)\s*(h|hour|hours|m|min|minutes?)$/i);
  if (!match) return 24 * 60 * 60 * 1000;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit.startsWith("m")) return amount * 60 * 1000;
  return amount * 60 * 60 * 1000;
}

function isSourceDue(source: GrantSourceRow, now = Date.now()): boolean {
  if (!source.enabled) return false;
  if (!source.last_crawled_at) return true;
  const last = new Date(source.last_crawled_at).getTime();
  if (!Number.isFinite(last)) return true;
  return last + intervalToMs(source.crawl_frequency) <= now;
}

function countNotifications(
  rows: NotificationLogRow[],
  options: { since?: Date; type?: string; channel?: string; status?: string }
): number {
  return rows.filter((row) => {
    if (options.since && !isSince(row.createdAt, options.since)) return false;
    if (options.type && row.type !== options.type) return false;
    if (options.channel && row.channel !== options.channel) return false;
    if (options.status && row.status !== options.status) return false;
    return true;
  }).length;
}

function distinctSentUsers(rows: NotificationLogRow[], since: Date): Set<string> {
  return new Set(
    rows
      .filter((row) => row.status === "sent" && isSince(row.createdAt, since))
      .map((row) => row.userId)
      .filter((id): id is string => Boolean(id))
  );
}

function distinctOrgCount(userIds: Set<string>, memberships: OrganisationMemberRow[]): number {
  const orgIds = new Set<string>();
  for (const member of memberships) {
    const userId = member.userId ?? member.user_id;
    const orgId = member.organisationId ?? member.organisation_id;
    if (userId && orgId && userIds.has(userId)) {
      orgIds.add(orgId);
    }
  }
  return orgIds.size;
}

function getStatusCount(rows: NotificationLogRow[], type: string, status: string, since: Date): number {
  return rows.filter((row) => row.type === type && row.status === status && isSince(row.createdAt, since)).length;
}

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in?redirect=/admin");
  }

  const allowed = await isAdmin();
  if (!allowed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <ShieldCheck className="h-5 w-5" />
              Access denied
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Only the admin account can access this page. You are signed in as{" "}
              <span className="font-medium text-foreground">{user.email}</span>.
            </p>
            <Link href="/dashboard" className="mt-4 block">
              <Button variant="outline">Back to Dashboard</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const supabase = getSupabaseAdmin();
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const next7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [
    grantsLast24hResult,
    grantsLast7dResult,
    latestGrantsResult,
    notificationResult,
    assessmentLast24hResult,
    assessmentLast7dResult,
    upcomingDeadlineResult,
    grantSourcesResult,
    discoveryPendingResult,
    discoveryFailedResult,
    linksPendingResult,
    linksFoundResult,
    linksManualReviewResult,
    linksFailedResult,
    cronRunsResult,
  ] = await Promise.all([
    supabase.from("Grant").select("id", { count: "exact", head: true }).gte("createdAt", last24h.toISOString()),
    supabase.from("Grant").select("id", { count: "exact", head: true }).gte("createdAt", last7d.toISOString()),
    supabase
      .from("Grant")
      .select("id, name, funder, source, deadline, createdAt")
      .order("createdAt", { ascending: false })
      .limit(5),
    supabase
      .from("NotificationLog")
      .select("userId, channel, type, status, error, createdAt")
      .in("type", [...OPS_NOTIFICATION_TYPES])
      .gte("createdAt", last7d.toISOString())
      .order("createdAt", { ascending: false })
      .limit(10000),
    supabase
      .from("EligibilityAssessment")
      .select("id", { count: "exact", head: true })
      .gte("updated_at", last24h.toISOString()),
    supabase
      .from("EligibilityAssessment")
      .select("id", { count: "exact", head: true })
      .gte("updated_at", last7d.toISOString()),
    supabase
      .from("Grant")
      .select("id, name, funder, source, deadline, createdAt", { count: "exact" })
      .gte("deadline", now.toISOString())
      .lte("deadline", next7d.toISOString())
      .order("deadline", { ascending: true })
      .limit(5),
    supabase
      .from("grant_sources")
      .select("source_name, type, adapter, enabled, crawl_frequency, last_crawled_at")
      .order("last_crawled_at", { ascending: false, nullsFirst: false })
      .limit(500),
    supabase.from("grant_discovery_queue").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("grant_discovery_queue").select("id", { count: "exact", head: true }).eq("status", "failed"),
    supabase.from("grant_links").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("grant_links").select("id", { count: "exact", head: true }).eq("status", "found"),
    supabase.from("grant_links").select("id", { count: "exact", head: true }).eq("status", "manual_review_needed"),
    supabase.from("grant_links").select("id", { count: "exact", head: true }).eq("status", "failed"),
    supabase
      .from("CronRunLog")
      .select("job_name, route, trigger, status, error, started_at, finished_at, duration_ms")
      .gte("started_at", last7d.toISOString())
      .order("started_at", { ascending: false })
      .limit(200),
  ]);

  const notificationRows = (notificationResult.data ?? []) as NotificationLogRow[];
  const sentUsersLast24h = distinctSentUsers(notificationRows, last24h);
  const sentUsersLast7d = distinctSentUsers(notificationRows, last7d);
  const notificationUserIds = Array.from(new Set(notificationRows.map((row) => row.userId).filter(Boolean))) as string[];

  let memberships: OrganisationMemberRow[] = [];
  if (notificationUserIds.length > 0) {
    const membershipResult = await supabase
      .from("OrganisationMember")
      .select("userId, organisationId")
      .in("userId", notificationUserIds);
    memberships = (membershipResult.data ?? []) as OrganisationMemberRow[];
    if (memberships.length === 0) {
      const fallback = await supabase
        .from("OrganisationMember")
        .select("user_id, organisation_id")
        .in("user_id", notificationUserIds);
      memberships = (fallback.data ?? []) as OrganisationMemberRow[];
    }
  }

  const latestGrants = (latestGrantsResult.data ?? []) as GrantRow[];
  const upcomingDeadlines = (upcomingDeadlineResult.data ?? []) as GrantRow[];
  const grantSources = (grantSourcesResult.data ?? []) as GrantSourceRow[];
  if (cronRunsResult.error) {
    console.warn("[admin] CronRunLog query failed:", cronRunsResult.error.message);
  }
  const cronRuns = (cronRunsResult.data ?? []) as CronRunLogRow[];
  const latestCronRun = cronRuns[0] ?? null;
  const failedCronRunsLast24h = cronRuns.filter((row) => row.status === "failed" && isSince(row.started_at, last24h));
  const failedCronRunsLast7d = cronRuns.filter((row) => row.status === "failed" && isSince(row.started_at, last7d));
  const recentFailedCronRuns = failedCronRunsLast7d.slice(0, 6);
  const dueSources = grantSources.filter((source) => isSourceDue(source)).length;
  const enabledSources = grantSources.filter((source) => source.enabled).length;
  const latestSourceCrawl = grantSources
    .map((source) => source.last_crawled_at)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
  const discoveryQueue: QueueStatus = {
    pending: discoveryPendingResult.count ?? 0,
    failed: discoveryFailedResult.count ?? 0,
  };
  const linkScout: QueueStatus = {
    pending: linksPendingResult.count ?? 0,
    found: linksFoundResult.count ?? 0,
    manualReview: linksManualReviewResult.count ?? 0,
    failed: linksFailedResult.count ?? 0,
  };

  const notificationErrors = notificationRows
    .filter((row) => row.status === "failed" || row.status === "skipped")
    .slice(0, 5);
  const totalSentLast24h = countNotifications(notificationRows, { since: last24h, status: "sent" });
  const totalFailedLast24h = countNotifications(notificationRows, { since: last24h, status: "failed" });
  const totalSkippedLast24h = countNotifications(notificationRows, { since: last24h, status: "skipped" });
  const highMatchWhatsAppLast24h = countNotifications(notificationRows, {
    since: last24h,
    type: "grant_match_high",
    channel: "whatsapp",
    status: "sent",
  });
  const deadlineEmailsLast24h =
    countNotifications(notificationRows, { since: last24h, type: "deadline_reminder", channel: "email", status: "sent" }) +
    countNotifications(notificationRows, {
      since: last24h,
      type: "deadline_daily_update",
      channel: "email",
      status: "sent",
    });
  const eligibilityEmailsLast24h =
    countNotifications(notificationRows, { since: last24h, type: "grant_scan_digest", channel: "email", status: "sent" }) +
    countNotifications(notificationRows, {
      since: last24h,
      type: "daily_grant_update",
      channel: "email",
      status: "sent",
    });
  const upgradePromptsLast24h = countNotifications(notificationRows, {
    since: last24h,
    type: "eligibility_upgrade_prompt",
    channel: "email",
    status: "sent",
  });
  const organisationCountLast24h = distinctOrgCount(sentUsersLast24h, memberships);
  const organisationCountLast7d = distinctOrgCount(sentUsersLast7d, memberships);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-3 px-4 sm:h-24 sm:px-6 lg:px-8">
          <Link href="/admin" className="flex min-w-0 items-center gap-2">
            <div className="relative flex items-center">
              <Image 
                src="/logogc.png" 
                alt="GrantsCopilot Logo" 
                width={480} 
                height={120} 
                className="h-12 w-auto object-contain sm:h-20"
                priority
              />
            </div>
            <span className="text-xl font-bold">Admin</span>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden max-w-[220px] truncate text-sm text-muted-foreground sm:inline">{user.email}</span>
            <Link href="/dashboard">
              <Button variant="ghost" size="sm">Dashboard</Button>
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:p-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Admin</h1>
          <p className="mt-1 text-muted-foreground">
            You are logged in as the admin account. Import, compose, and verify grant records here.
          </p>
        </div>
        <section className="space-y-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <h2 className="text-xl font-semibold">Operations pulse</h2>
              <p className="text-sm text-muted-foreground">
                Last 24 hours and last 7 days across grants, scoring, notifications, deadlines, and crawlers.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Refreshed {formatDateTime(now.toISOString())}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Database className="h-4 w-4 text-blue-600" />
                  Grants added
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{grantsLast24hResult.count ?? 0}</div>
                <p className="mt-1 text-sm text-muted-foreground">{grantsLast7dResult.count ?? 0} in the last 7 days</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Users className="h-4 w-4 text-blue-600" />
                  Accounts notified
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{sentUsersLast24h.size}</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {organisationCountLast24h} orgs today - {sentUsersLast7d.size} users / {organisationCountLast7d} orgs in 7 days
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Bell className="h-4 w-4 text-blue-600" />
                  Notifications sent
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{totalSentLast24h}</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {totalFailedLast24h} failed - {totalSkippedLast24h} skipped in the last 24h
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <SearchCheck className="h-4 w-4 text-blue-600" />
                  Scores refreshed
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{assessmentLast24hResult.count ?? 0}</div>
                <p className="mt-1 text-sm text-muted-foreground">{assessmentLast7dResult.count ?? 0} score rows updated in 7 days</p>
              </CardContent>
            </Card>
            <Card className={failedCronRunsLast24h.length > 0 ? "border-red-200 bg-red-50/60" : ""}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <ServerCrash className={`h-4 w-4 ${failedCronRunsLast24h.length > 0 ? "text-red-600" : "text-blue-600"}`} />
                  Cron failures
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{failedCronRunsLast24h.length}</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {failedCronRunsLast7d.length} in 7 days
                  {latestCronRun?.started_at && <> · latest {formatRelative(latestCronRun.started_at)}</>}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid items-start gap-4 xl:grid-cols-2 2xl:grid-cols-4">
            <Card className="min-w-0 overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Mail className="h-4 w-4 text-blue-600" />
                  Morning notification trace
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-[28rem] space-y-3 overflow-y-auto pr-2 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border bg-muted/30 p-3">
                    <div className="text-xs text-muted-foreground">Eligibility emails</div>
                    <div className="text-2xl font-semibold">{eligibilityEmailsLast24h}</div>
                  </div>
                  <div className="rounded-md border bg-muted/30 p-3">
                    <div className="text-xs text-muted-foreground">Upgrade prompts</div>
                    <div className="text-2xl font-semibold">{upgradePromptsLast24h}</div>
                  </div>
                  <div className="rounded-md border bg-muted/30 p-3">
                    <div className="text-xs text-muted-foreground">Deadline emails</div>
                    <div className="text-2xl font-semibold">{deadlineEmailsLast24h}</div>
                  </div>
                  <div className="rounded-md border bg-muted/30 p-3">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MessageCircle className="h-3.5 w-3.5" />
                      WhatsApp alerts
                    </div>
                    <div className="text-2xl font-semibold">{highMatchWhatsAppLast24h}</div>
                  </div>
                </div>
                {notificationErrors.length > 0 ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
                    <div className="mb-2 flex items-center gap-2 font-medium">
                      <AlertTriangle className="h-4 w-4" />
                      Recent skipped or failed sends
                    </div>
                    <ul className="space-y-1">
                      {notificationErrors.map((row, index) => (
                        <li key={`${row.type}-${row.channel}-${row.createdAt}-${index}`} className="text-xs">
                          {row.type ?? "notification"} / {row.channel ?? "unknown"}: {row.error ?? row.status ?? "unknown"}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No failed or skipped notification rows in the latest log sample.</p>
                )}
              </CardContent>
            </Card>

            <Card className="min-w-0 overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarClock className="h-4 w-4 text-blue-600" />
                  Deadlines
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-[28rem] space-y-3 overflow-y-auto pr-2 text-sm">
                <div>
                  <div className="text-3xl font-bold">{upcomingDeadlineResult.count ?? 0}</div>
                  <p className="text-muted-foreground">grant deadlines in the next 7 days</p>
                </div>
                <div className="space-y-2">
                  {upcomingDeadlines.length > 0 ? (
                    upcomingDeadlines.map((grant) => (
                      <div key={grant.id} className="rounded-md border p-3">
                        <div className="font-medium">{grant.name ?? "Untitled grant"}</div>
                        <div className="text-xs text-muted-foreground">
                          {grant.funder ?? "Unknown funder"} - due {formatDateTime(grant.deadline)}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground">No grant deadlines are recorded for the next 7 days.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="min-w-0 overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <SearchCheck className="h-4 w-4 text-blue-600" />
                  Crawler health
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-[28rem] space-y-3 overflow-y-auto pr-2 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border bg-muted/30 p-3">
                    <div className="text-xs text-muted-foreground">Enabled sources</div>
                    <div className="text-2xl font-semibold">{enabledSources}</div>
                  </div>
                  <div className="rounded-md border bg-muted/30 p-3">
                    <div className="text-xs text-muted-foreground">Due sources</div>
                    <div className="text-2xl font-semibold">{dueSources}</div>
                  </div>
                  <div className="rounded-md border bg-muted/30 p-3">
                    <div className="text-xs text-muted-foreground">Discovery pending</div>
                    <div className="text-2xl font-semibold">{discoveryQueue.pending}</div>
                  </div>
                  <div className="rounded-md border bg-muted/30 p-3">
                    <div className="text-xs text-muted-foreground">Scout review</div>
                    <div className="text-2xl font-semibold">{linkScout.manualReview ?? 0}</div>
                  </div>
                </div>
                <p className="text-muted-foreground">
                  Latest source crawl: {latestSourceCrawl ? `${formatRelative(latestSourceCrawl)} (${formatDateTime(latestSourceCrawl)})` : "never"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Discovery failed: {discoveryQueue.failed}. Link scout found: {linkScout.found ?? 0}, pending: {linkScout.pending}, failed: {linkScout.failed}.
                </p>
              </CardContent>
            </Card>

            <Card className="min-w-0 overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ServerCrash className={`h-4 w-4 ${failedCronRunsLast24h.length > 0 ? "text-red-600" : "text-blue-600"}`} />
                  Cron runs
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-[28rem] space-y-3 overflow-y-auto pr-2 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border bg-muted/30 p-3">
                    <div className="text-xs text-muted-foreground">Failed 24h</div>
                    <div className="text-2xl font-semibold">{failedCronRunsLast24h.length}</div>
                  </div>
                  <div className="rounded-md border bg-muted/30 p-3">
                    <div className="text-xs text-muted-foreground">Failed 7d</div>
                    <div className="text-2xl font-semibold">{failedCronRunsLast7d.length}</div>
                  </div>
                </div>
                {latestCronRun ? (
                  <p className="text-muted-foreground">
                    Latest run: {latestCronRun.job_name ?? latestCronRun.route ?? "Cron"} · {latestCronRun.status ?? "unknown"} · {formatRelative(latestCronRun.started_at)}
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    Cron run logging starts after this deployment and the database migration is applied.
                  </p>
                )}
                {recentFailedCronRuns.length > 0 ? (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-900">
                    <div className="mb-2 flex items-center gap-2 font-medium">
                      <AlertTriangle className="h-4 w-4" />
                      Recent failed cron runs
                    </div>
                    <ul className="space-y-2">
                      {recentFailedCronRuns.map((run, index) => (
                        <li key={`${run.route}-${run.started_at}-${index}`} className="text-xs">
                          <div className="font-medium">{run.job_name ?? run.route ?? "Cron job"}</div>
                          <div>{formatDateTime(run.started_at)} · {formatDurationMs(run.duration_ms)}</div>
                          {run.error && <div className="mt-1 break-words">{run.error}</div>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No failed cron runs in the last 7 days.</p>
                )}
                {cronRuns.length > 0 && (
                  <div className="space-y-2">
                    {cronRuns.slice(0, 8).map((run, index) => (
                      <div key={`cron-run-${run.route}-${run.started_at}-${index}`} className="rounded-md border p-3 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate font-medium">{run.job_name ?? run.route ?? "Cron job"}</span>
                          <span className={run.status === "failed" ? "font-medium text-red-600" : "text-emerald-700"}>
                            {run.status ?? "unknown"}
                          </span>
                        </div>
                        <div className="mt-1 text-muted-foreground">
                          {run.trigger ?? "cron"} · {formatRelative(run.started_at)} · {formatDurationMs(run.duration_ms)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notification breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-[28rem] overflow-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-4 font-medium">Signal</th>
                      <th className="py-2 pr-4 font-medium">24h sent</th>
                      <th className="py-2 pr-4 font-medium">7d sent</th>
                      <th className="py-2 pr-4 font-medium">Email 24h</th>
                      <th className="py-2 pr-4 font-medium">WhatsApp 24h</th>
                      <th className="py-2 pr-4 font-medium">Failed 24h</th>
                      <th className="py-2 pr-4 font-medium">Skipped 24h</th>
                    </tr>
                  </thead>
                  <tbody>
                    {OPS_NOTIFICATION_TYPES.map((type) => (
                      <tr key={type} className="border-b last:border-0">
                        <td className="py-3 pr-4 font-medium">{NOTIFICATION_LABELS[type]}</td>
                        <td className="py-3 pr-4">{getStatusCount(notificationRows, type, "sent", last24h)}</td>
                        <td className="py-3 pr-4">{getStatusCount(notificationRows, type, "sent", last7d)}</td>
                        <td className="py-3 pr-4">
                          {countNotifications(notificationRows, { since: last24h, type, channel: "email", status: "sent" })}
                        </td>
                        <td className="py-3 pr-4">
                          {countNotifications(notificationRows, { since: last24h, type, channel: "whatsapp", status: "sent" })}
                        </td>
                        <td className="py-3 pr-4">{getStatusCount(notificationRows, type, "failed", last24h)}</td>
                        <td className="py-3 pr-4">{getStatusCount(notificationRows, type, "skipped", last24h)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Latest grants added</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-[24rem] overflow-y-auto pr-2">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  {latestGrants.length > 0 ? (
                    latestGrants.map((grant) => (
                      <div key={grant.id} className="rounded-md border p-3 text-sm">
                        <div className="line-clamp-2 font-medium">{grant.name ?? "Untitled grant"}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{grant.funder ?? "Unknown funder"}</div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          {grant.source ?? "database"} - {formatRelative(grant.createdAt)}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No grants found in the database.</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
        <GrantComposer />
        <GrantImportUploader />
        <ScoutModeSettings />
        <TestNotificationButton />
        <Card>
          <CardHeader>
            <CardTitle>API import</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              You can also import via API: <code className="rounded bg-muted px-1 py-0.5">POST /api/admin/grants/import</code> with header{" "}
              <code className="rounded bg-muted px-1 py-0.5">x-grants-import-secret</code> and a JSON array of grants.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
