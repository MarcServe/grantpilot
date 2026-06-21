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
  Brain,
  CalendarClock,
  ClipboardCheck,
  Database,
  EyeOff,
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
import { GrantSourceManager } from "@/components/admin/grant-source-manager";
import { DeepScoreQueueActions } from "@/components/admin/deep-score-queue-actions";
import { GrantIntelligenceActions } from "@/components/admin/grant-intelligence-actions";
import { ReviewQueueActions } from "@/components/admin/review-queue-actions";
import { WhatsAppDiagnosticsPanel } from "@/components/admin/whatsapp-diagnostics-panel";
import { getServerCache } from "@/lib/server-cache";

export const dynamic = "force-dynamic";

const OPS_NOTIFICATION_TYPES = [
  "grant_scan_digest",
  "grant_match_high",
  "daily_grant_update",
  "eligibility_upgrade_prompt",
  "business_dna_match_health",
  "deadline_reminder",
  "deadline_daily_update",
] as const;
const ADMIN_BATCH_SIZE = 20;
const ADMIN_NOTIFICATION_SAMPLE_SIZE = 120;
const ADMIN_GRANT_SOURCE_STATUS_LIMIT = 120;
const ADMIN_SOURCE_ATTRIBUTION_SAMPLE_SIZE = 500;
const ADMIN_OVERVIEW_CACHE_TTL_MS = 20_000;

type AdminSearchParams = Promise<Record<string, string | string[] | undefined>>;

type AdminPageKey =
  | "latestGrantsPage"
  | "deadlinesPage"
  | "cronRunsPage"
  | "suppressedPage"
  | "deliveriesPage"
  | "reviewQueuePage";

type OpsNotificationType = (typeof OPS_NOTIFICATION_TYPES)[number];

type NotificationLogRow = {
  userId: string | null;
  channel: string | null;
  type: string | null;
  status: string | null;
  error: string | null;
  createdAt: string | null;
};

type UserRow = {
  id: string;
  email: string | null;
};

type GrantRow = {
  id: string;
  name: string | null;
  funder: string | null;
  source: string | null;
  deadline: string | null;
  createdAt: string | null;
  url_status?: string | null;
};

type SavedGrantSuppressionStatus = "saved" | "viewed" | "deferred" | "applied" | "dismissed";

type SavedGrantSuppressionRow = {
  organisation_id: string | null;
  profile_id: string | null;
  grant_id: string | null;
  status: SavedGrantSuppressionStatus | null;
  suppress_notifications: boolean | null;
  viewed_at: string | null;
  deferred_at: string | null;
  applied_at: string | null;
  dismissed_at: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ProfileSummaryRow = {
  id: string;
  businessName?: string | null;
  business_name?: string | null;
};

type OrganisationSummaryRow = {
  id: string;
  name: string | null;
};

type AssessmentSummaryRow = {
  grant_id: string | null;
  profile_id: string | null;
  score: number | null;
  decision: string | null;
  summary: string | null;
  updated_at: string | null;
};

type SuppressedGrantDetail = {
  row: SavedGrantSuppressionRow;
  grantId: string | null;
  grantName: string;
  funder: string;
  profileName: string;
  organisationName: string;
  reason: string;
  changedAt: string | null;
  grant?: GrantRow;
  assessment?: AssessmentSummaryRow;
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

type GrantSourceImportRunRow = {
  run_source: string | null;
  created_by: string | null;
  requested_count: number | null;
  added_count: number | null;
  skipped_duplicate_count: number | null;
  rejected_count: number | null;
  manual_review_count: number | null;
  created_at: string | null;
};

type SourceImportSummaryRow = {
  key: string;
  label: string;
  runs: number;
  requested: number;
  added: number;
  duplicates: number;
  rejected: number;
  manualReview: number;
  latestAt: string | null;
  latestCreatedBy: string | null;
};

type GrantSourceAttributionRow = {
  source: string | null;
  createdAt: string | null;
};

type GrantSourceCountRow = {
  label: string;
  detail: string;
  total: number;
  today: number;
};

type DiscoveryProviderStatus = {
  label: string;
  configured: boolean;
  detail: string;
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
  result?: unknown;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
};

type AiDiscoveryActivity = {
  openai: number;
  perplexity: number;
  claude: number;
  gemini: number;
  providerStats: Record<AiDiscoveryProviderKey, AiDiscoveryProviderStats>;
  created: number;
  updated: number;
  rejected: number;
  runs: number;
};

type AiDiscoveryProviderKey = "openai" | "perplexity" | "claude" | "gemini";

type AiDiscoveryProviderStats = {
  raw: number;
  accepted: number;
  created: number;
  updated: number;
  duplicate: number;
  rejected: number;
  errors: number;
  errorSamples: string[];
};

const AI_DISCOVERY_PROVIDER_KEYS: Array<{ key: AiDiscoveryProviderKey; label: string }> = [
  { key: "openai", label: "OpenAI" },
  { key: "perplexity", label: "Perplexity" },
  { key: "claude", label: "Claude" },
  { key: "gemini", label: "Gemini" },
];

type SourceReviewQueueRow = {
  id: string;
  kind: string | null;
  source_name: string | null;
  endpoint: string | null;
  country: string | null;
  source_type: string | null;
  crawl_frequency: string | null;
  status: string | null;
  reason: string | null;
  grant_id: string | null;
  grant_link_id: number | null;
  created_at: string | null;
  updated_at: string | null;
};

type DeepScoreQueueRow = {
  id: string;
  organisation_id: string | null;
  profile_id: string | null;
  grant_id: string | null;
  status: string | null;
  heuristic_score: number | null;
  full_score: number | null;
  full_decision: string | null;
  attempts: number | null;
  last_error: string | null;
  updated_at: string | null;
};

const NOTIFICATION_LABELS: Record<OpsNotificationType, string> = {
  grant_scan_digest: "Paid eligibility digest",
  grant_match_high: "WhatsApp high-match alert",
  daily_grant_update: "Daily scan email",
  eligibility_upgrade_prompt: "Upgrade prompt email",
  business_dna_match_health: "Business DNA prompt",
  deadline_reminder: "Deadline reminder email",
  deadline_daily_update: "Deadline scan email",
};

const LONDON_DATE = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/London",
});

const LONDON_DAY = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "Europe/London",
});

const ADMIN_REPORT_TIME_ZONE = "Europe/London";

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value ?? 0);
  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
    second: part("second"),
  };
}

function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = zonedParts(date, timeZone);
  const zonedUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return zonedUtc - date.getTime();
}

function startOfDayInTimeZone(date: Date, timeZone: string): Date {
  const parts = zonedParts(date, timeZone);
  const localMidnightUtc = Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0);
  const firstPass = localMidnightUtc - timeZoneOffsetMs(new Date(localMidnightUtc), timeZone);
  return new Date(localMidnightUtc - timeZoneOffsetMs(new Date(firstPass), timeZone));
}

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

function grantSourceLabel(source?: string | null): string {
  const value = source?.trim().toLowerCase();
  if (!value || value === "default") return "Database links / RSS";
  if (value === "openai") return "OpenAI search";
  if (value === "perplexity") return "Perplexity search";
  if (value === "claude") return "Claude search";
  if (value === "gemini") return "Gemini search";
  if (value === "admin") return "Admin import";
  if (value === "grants-gov") return "Grants.gov";
  return source ?? "Unknown";
}

const GRANT_SOURCE_COUNT_BUCKETS: Array<{
  label: string;
  detail: string;
  sources: Array<string | null>;
}> = [
  { label: "Database links / RSS", detail: "Registry, feed, API, or source crawler import", sources: [null, "default"] },
  { label: "OpenAI search", detail: "AI discovery", sources: ["openai"] },
  { label: "Perplexity search", detail: "AI discovery", sources: ["perplexity"] },
  { label: "Claude search", detail: "AI discovery", sources: ["claude"] },
  { label: "Gemini search", detail: "AI discovery", sources: ["gemini"] },
  { label: "Grants.gov", detail: "US registry import", sources: ["grants-gov"] },
  { label: "Google search", detail: "Search discovery", sources: ["google"] },
  { label: "Bing search", detail: "Search discovery", sources: ["bing"] },
  { label: "Admin import", detail: "Manual/admin-created grants", sources: ["admin"] },
];

const ALWAYS_VISIBLE_SOURCE_LABELS = new Set([
  "Database links / RSS",
  "OpenAI search",
  "Perplexity search",
  "Claude search",
  "Gemini search",
  "Grants.gov",
]);

const EXPECTED_SOURCE_IMPORT_RUNS: Array<{ key: string; label: string }> = [
  { key: "apify", label: "Apify cron" },
  { key: "codex_automation", label: "Codex automation" },
  { key: "app_default_seed", label: "Default source seed/crawler" },
];

async function countGrantSourceBucket(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  sources: Array<string | null>,
  since?: Date
): Promise<number> {
  let query = supabase.from("Grant").select("id", { count: "exact", head: true });
  if (since) query = query.gte("createdAt", since.toISOString());

  if (sources.includes(null) && sources.includes("default")) {
    query = query.or("source.is.null,source.eq.default");
  } else if (sources.includes(null)) {
    query = query.is("source", null);
  } else if (sources.length === 1) {
    query = query.eq("source", sources[0] ?? "");
  } else {
    query = query.in("source", sources.filter((source): source is string => Boolean(source)));
  }

  const result = await query;
  if (result.error) {
    console.warn("[admin] Grant source count query failed:", result.error.message);
    return 0;
  }
  return result.count ?? 0;
}

async function getGrantSourceCountRows(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  since: Date
): Promise<GrantSourceCountRow[]> {
  const rows = await Promise.all(
    GRANT_SOURCE_COUNT_BUCKETS.map(async (bucket) => {
      const [total, recent] = await Promise.all([
        countGrantSourceBucket(supabase, bucket.sources),
        countGrantSourceBucket(supabase, bucket.sources, since),
      ]);
      return {
        label: bucket.label,
        detail: bucket.detail,
        total,
        today: recent,
      };
    })
  );

  return rows
    .filter((row) => row.total > 0 || row.today > 0 || ALWAYS_VISIBLE_SOURCE_LABELS.has(row.label))
    .sort((a, b) => {
      if (b.today !== a.today) return b.today - a.today;
      return b.total - a.total;
    });
}

function sourceImportRunLabel(key: string): string {
  if (key === "apify") return "Apify cron";
  if (key === "codex_automation") return "Codex automation";
  if (key === "app_default_seed") return "Default source seed/crawler";
  if (key === "codex_automation_recovery") return "Codex recovery";
  if (key === "manual_recovery") return "Manual recovery";
  return key.replace(/_/g, " ");
}

function emptySourceImportSummary(key: string, label = sourceImportRunLabel(key)): SourceImportSummaryRow {
  return {
    key,
    label,
    runs: 0,
    requested: 0,
    added: 0,
    duplicates: 0,
    rejected: 0,
    manualReview: 0,
    latestAt: null,
    latestCreatedBy: null,
  };
}

function summarizeSourceImportRuns(rows: GrantSourceImportRunRow[]): SourceImportSummaryRow[] {
  const summaries = new Map<string, SourceImportSummaryRow>();
  EXPECTED_SOURCE_IMPORT_RUNS.forEach((source) => {
    summaries.set(source.key, emptySourceImportSummary(source.key, source.label));
  });

  for (const row of rows) {
    const key = row.run_source?.trim() || "unknown";
    const current = summaries.get(key) ?? emptySourceImportSummary(key);
    current.runs += 1;
    current.requested += readNumber(row.requested_count);
    current.added += readNumber(row.added_count);
    current.duplicates += readNumber(row.skipped_duplicate_count);
    current.rejected += readNumber(row.rejected_count);
    current.manualReview += readNumber(row.manual_review_count);
    if (row.created_at && (!current.latestAt || new Date(row.created_at).getTime() > new Date(current.latestAt).getTime())) {
      current.latestAt = row.created_at;
      current.latestCreatedBy = row.created_by;
    }
    summaries.set(key, current);
  }

  return Array.from(summaries.values()).sort((a, b) => {
    const aExpected = EXPECTED_SOURCE_IMPORT_RUNS.findIndex((source) => source.key === a.key);
    const bExpected = EXPECTED_SOURCE_IMPORT_RUNS.findIndex((source) => source.key === b.key);
    if (aExpected !== -1 || bExpected !== -1) {
      if (aExpected === -1) return 1;
      if (bExpected === -1) return -1;
      return aExpected - bExpected;
    }
    return new Date(b.latestAt ?? 0).getTime() - new Date(a.latestAt ?? 0).getTime();
  });
}

function hasEnv(...names: string[]): boolean {
  return names.some((name) => Boolean(process.env[name]?.trim()));
}

function discoveryProviderStatuses(): DiscoveryProviderStatus[] {
  return [
    {
      label: "OpenAI",
      configured: hasEnv("OPENAI_API_KEY"),
      detail: "Trusted eligibility scoring and web discovery",
    },
    {
      label: "Perplexity",
      configured: hasEnv("PERPLEXITY_API_KEY"),
      detail: "Web-grounded grant discovery",
    },
    {
      label: "Claude",
      configured: hasEnv("ANTHROPIC_API_KEY", "CLAUDE_API_KEY"),
      detail: "Web-search grant discovery",
    },
    {
      label: "Gemini",
      configured: hasEnv("GEMINI_API_KEY", "GOOGLE_AI_API_KEY"),
      detail: "Grant discovery enrichment",
    },
    {
      label: "Apify",
      configured: hasEnv("APIFY_TOKEN"),
      detail: "Daily source-discovery cron",
    },
  ];
}

function readNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function emptyAiDiscoveryProviderStats(): AiDiscoveryProviderStats {
  return {
    raw: 0,
    accepted: 0,
    created: 0,
    updated: 0,
    duplicate: 0,
    rejected: 0,
    errors: 0,
    errorSamples: [],
  };
}

function emptyAiDiscoveryProviderStatsMap(): Record<AiDiscoveryProviderKey, AiDiscoveryProviderStats> {
  return {
    openai: emptyAiDiscoveryProviderStats(),
    perplexity: emptyAiDiscoveryProviderStats(),
    claude: emptyAiDiscoveryProviderStats(),
    gemini: emptyAiDiscoveryProviderStats(),
  };
}

function addProviderStats(
  target: AiDiscoveryProviderStats,
  source: Record<string, unknown>
): void {
  target.raw += readNumber(source.raw);
  target.accepted += readNumber(source.accepted);
  target.created += readNumber(source.created);
  target.updated += readNumber(source.updated);
  target.duplicate += readNumber(source.duplicate);
  target.rejected += readNumber(source.rejected);
  target.errors += readNumber(source.errors);
  const samples = Array.isArray(source.errorSamples) ? source.errorSamples : [];
  target.errorSamples.push(
    ...samples.filter((sample): sample is string => typeof sample === "string").slice(0, 3)
  );
  target.errorSamples = target.errorSamples.slice(0, 5);
}

function discoveryActivityFromCronRuns(rows: CronRunLogRow[]): AiDiscoveryActivity {
  const activity: AiDiscoveryActivity = {
    openai: 0,
    perplexity: 0,
    claude: 0,
    gemini: 0,
    providerStats: emptyAiDiscoveryProviderStatsMap(),
    created: 0,
    updated: 0,
    rejected: 0,
    runs: 0,
  };

  for (const row of rows) {
    if (row.status !== "success") continue;
    if (row.route !== "/api/cron/grant-discovery" && row.route !== "inngest/grant-discovery") continue;
    const result = row.result && typeof row.result === "object" ? row.result as Record<string, unknown> : null;
    if (!result) continue;
    const providers = result.providers && typeof result.providers === "object"
      ? result.providers as Record<string, unknown>
      : null;
    const providerStats = result.providerStats && typeof result.providerStats === "object"
      ? result.providerStats as Record<string, unknown>
      : null;
    let usedStructuredStats = false;

    for (const provider of AI_DISCOVERY_PROVIDER_KEYS) {
      const structured = providerStats?.[provider.key];
      if (structured && typeof structured === "object") {
        const beforeRaw = activity.providerStats[provider.key].raw;
        addProviderStats(activity.providerStats[provider.key], structured as Record<string, unknown>);
        activity[provider.key] += activity.providerStats[provider.key].raw - beforeRaw;
        usedStructuredStats = true;
      }
    }

    if (!usedStructuredStats) {
      for (const provider of AI_DISCOVERY_PROVIDER_KEYS) {
        const raw = readNumber(providers?.[provider.key]);
        activity[provider.key] += raw;
        activity.providerStats[provider.key].raw += raw;
      }
    }
    activity.created += readNumber(result.created);
    activity.updated += readNumber(result.updated);
    activity.rejected += readNumber(result.rejected);
    activity.runs += 1;
  }

  return activity;
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

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function profileDisplayName(profile?: ProfileSummaryRow): string {
  return profile?.businessName ?? profile?.business_name ?? "Unknown profile";
}

function suppressionChangedAt(row: SavedGrantSuppressionRow): string | null {
  if (row.status === "dismissed") return row.dismissed_at ?? row.updated_at ?? row.created_at;
  if (row.status === "applied") return row.applied_at ?? row.updated_at ?? row.created_at;
  if (row.status === "deferred") return row.deferred_at ?? row.updated_at ?? row.created_at;
  if (row.status === "viewed") return row.viewed_at ?? row.updated_at ?? row.created_at;
  return row.updated_at ?? row.created_at;
}

function suppressionReason(row: SavedGrantSuppressionRow): string {
  switch (row.status) {
    case "viewed":
      return row.suppress_notifications
        ? "Legacy viewed row has suppression enabled; viewed grants no longer suppress eligibility alerts."
        : "Viewed in detail; this does not suppress eligibility alerts.";
    case "deferred":
      return "Deferred for later by the user.";
    case "applied":
      return "Added to applications or marked as applied.";
    case "dismissed":
      return "Dismissed by the user.";
    case "saved":
      return row.suppress_notifications
        ? "Saved row has suppression enabled; review this because saved-only grants should normally keep reminders available."
        : "Saved for later; not normally suppressed.";
    default:
      return row.suppress_notifications ? "Notifications suppressed for this profile/grant." : "Not suppressed.";
  }
}

function getStatusCount(rows: NotificationLogRow[], type: string, status: string, since: Date): number {
  return rows.filter((row) => row.type === type && row.status === status && isSince(row.createdAt, since)).length;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizePage(value: string | string[] | undefined): number {
  const parsed = Number(firstParam(value));
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

function pageRange(page: number): { from: number; to: number } {
  const from = (page - 1) * ADMIN_BATCH_SIZE;
  return { from, to: from + ADMIN_BATCH_SIZE - 1 };
}

function buildAdminHref(
  params: Record<string, string | string[] | undefined>,
  key: AdminPageKey,
  page: number
): string {
  const search = new URLSearchParams();
  for (const [paramKey, rawValue] of Object.entries(params)) {
    if (paramKey === key) continue;
    const value = firstParam(rawValue);
    if (value) search.set(paramKey, value);
  }
  if (page > 1) search.set(key, String(page));
  const query = search.toString();
  return query ? `/admin?${query}` : "/admin";
}

function PaginationControls({
  params,
  pageKey,
  page,
  totalCount,
  label,
}: {
  params: Record<string, string | string[] | undefined>;
  pageKey: AdminPageKey;
  page: number;
  totalCount: number;
  label: string;
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / ADMIN_BATCH_SIZE));
  const safePage = Math.min(page, totalPages);
  const from = totalCount === 0 ? 0 : (safePage - 1) * ADMIN_BATCH_SIZE + 1;
  const to = Math.min(safePage * ADMIN_BATCH_SIZE, totalCount);

  return (
    <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <span>
        {totalCount > 0
          ? `${label}: ${from}-${to} of ${totalCount}`
          : `${label}: 0 records`}
      </span>
      <div className="flex items-center gap-2">
        <Button asChild variant="outline" size="sm" aria-disabled={safePage <= 1}>
          <Link
            href={buildAdminHref(params, pageKey, Math.max(1, safePage - 1))}
            scroll={false}
            className={safePage <= 1 ? "pointer-events-none opacity-50" : undefined}
          >
            Previous
          </Link>
        </Button>
        <span>
          Page {safePage} / {totalPages}
        </span>
        <Button asChild variant="outline" size="sm" aria-disabled={safePage >= totalPages}>
          <Link
            href={buildAdminHref(params, pageKey, Math.min(totalPages, safePage + 1))}
            scroll={false}
            className={safePage >= totalPages ? "pointer-events-none opacity-50" : undefined}
          >
            Next
          </Link>
        </Button>
      </div>
    </div>
  );
}

export default async function AdminPage({ searchParams }: { searchParams?: AdminSearchParams }) {
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
  const params = (await searchParams) ?? {};
  const latestGrantsPage = normalizePage(params.latestGrantsPage);
  const deadlinesPage = normalizePage(params.deadlinesPage);
  const cronRunsPage = normalizePage(params.cronRunsPage);
  const suppressedPage = normalizePage(params.suppressedPage);
  const deliveriesPage = normalizePage(params.deliveriesPage);
  const reviewQueuePage = normalizePage(params.reviewQueuePage);
  const latestGrantsRange = pageRange(latestGrantsPage);
  const deadlinesRange = pageRange(deadlinesPage);
  const cronRunsRange = pageRange(cronRunsPage);
  const suppressedRange = pageRange(suppressedPage);
  const deliveriesRange = pageRange(deliveriesPage);
  const reviewQueueRange = pageRange(reviewQueuePage);
  const now = new Date();
  const todayStart = startOfDayInTimeZone(now, ADMIN_REPORT_TIME_ZONE);
  const reportDateLabel = LONDON_DAY.format(todayStart);
  const next7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const adminOverviewCacheKey = [
    "admin-overview:v3",
    `today:${todayStart.toISOString()}`,
    `latest:${latestGrantsPage}`,
    `deadlines:${deadlinesPage}`,
    `cron:${cronRunsPage}`,
    `suppressed:${suppressedPage}`,
    `deliveries:${deliveriesPage}`,
    `review:${reviewQueuePage}`,
  ].join(":");

  const [
    grantsTodayResult,
    latestGrantsResult,
    notificationResult,
    notificationDeliveryResult,
    assessmentTodayResult,
    upcomingDeadlineResult,
    grantSourcesResult,
    enabledGrantSourcesResult,
    sourceImportRunsResult,
    sourceImportRunsTodayResult,
    grantDiscoveryRunsResult,
    grantSourceAttributionResult,
    grantSourceCountRows,
    discoveryPendingResult,
    discoveryFailedResult,
    linksPendingResult,
    linksFoundResult,
    linksManualReviewResult,
    linksFailedResult,
    reviewQueuePendingResult,
    reviewQueueSourcePendingResult,
    reviewQueueLinkPendingResult,
    reviewQueueResult,
    deepScorePendingResult,
    deepScoreRunningResult,
    deepScoreCompletedTodayResult,
    deepScoreFailedResult,
    deepScoreRowsResult,
    aiScoreCacheResult,
    grantIntelligenceReadyResult,
    grantIntelligencePendingResult,
    grantIntelligenceFailedResult,
    grantIntelligenceQueuePendingResult,
    grantIntelligenceQueueRunningResult,
    grantIntelligenceQueueCompletedTodayResult,
    grantIntelligenceQueueFailedResult,
    latestCronRunResult,
    failedCronRunsTodayResult,
    recentFailedCronRunsResult,
    cronRunsResult,
    suppressedGrantsResult,
  ] = await getServerCache(
    adminOverviewCacheKey,
    { ttlMs: ADMIN_OVERVIEW_CACHE_TTL_MS, maxEntries: 60 },
    () => Promise.all([
      supabase.from("Grant").select("id", { count: "exact", head: true }).gte("createdAt", todayStart.toISOString()),
      supabase
        .from("Grant")
        .select("id, name, funder, source, deadline, createdAt", { count: "exact" })
        .order("createdAt", { ascending: false })
        .range(latestGrantsRange.from, latestGrantsRange.to),
      supabase
        .from("NotificationLog")
        .select("userId, channel, type, status, error, createdAt")
        .in("type", [...OPS_NOTIFICATION_TYPES])
        .gte("createdAt", todayStart.toISOString())
        .order("createdAt", { ascending: false })
        .limit(ADMIN_NOTIFICATION_SAMPLE_SIZE),
      supabase
        .from("NotificationLog")
        .select("userId, channel, type, status, error, createdAt", { count: "exact" })
        .in("type", [...OPS_NOTIFICATION_TYPES])
        .gte("createdAt", todayStart.toISOString())
        .order("createdAt", { ascending: false })
        .range(deliveriesRange.from, deliveriesRange.to),
      supabase
        .from("EligibilityAssessment")
        .select("id", { count: "exact", head: true })
        .gte("updated_at", todayStart.toISOString()),
      supabase
        .from("Grant")
        .select("id, name, funder, source, deadline, createdAt", { count: "exact" })
        .gte("deadline", now.toISOString())
        .lte("deadline", next7d.toISOString())
        .order("deadline", { ascending: true })
        .range(deadlinesRange.from, deadlinesRange.to),
      supabase
        .from("grant_sources")
        .select("source_name, type, adapter, enabled, crawl_frequency, last_crawled_at")
        .order("last_crawled_at", { ascending: false, nullsFirst: false })
        .limit(ADMIN_GRANT_SOURCE_STATUS_LIMIT),
      supabase
        .from("grant_sources")
        .select("id", { count: "exact", head: true })
        .eq("enabled", true),
      supabase
        .from("grant_source_import_runs")
        .select("run_source, created_by, requested_count, added_count, skipped_duplicate_count, rejected_count, manual_review_count, created_at")
        .order("created_at", { ascending: false })
        .limit(6),
      supabase
        .from("grant_source_import_runs")
        .select("run_source, created_by, requested_count, added_count, skipped_duplicate_count, rejected_count, manual_review_count, created_at")
        .gte("created_at", todayStart.toISOString())
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("CronRunLog")
        .select("job_name, route, trigger, status, result, error, started_at, finished_at, duration_ms")
        .in("route", ["/api/cron/grant-discovery", "inngest/grant-discovery"])
        .gte("started_at", todayStart.toISOString())
        .order("started_at", { ascending: false })
        .limit(60),
      supabase
        .from("Grant")
        .select("source, createdAt")
        .gte("createdAt", todayStart.toISOString())
        .limit(ADMIN_SOURCE_ATTRIBUTION_SAMPLE_SIZE),
      getGrantSourceCountRows(supabase, todayStart),
      supabase.from("grant_discovery_queue").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("grant_discovery_queue").select("id", { count: "exact", head: true }).eq("status", "failed"),
      supabase.from("grant_links").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("grant_links").select("id", { count: "exact", head: true }).eq("status", "found"),
      supabase.from("grant_links").select("id", { count: "exact", head: true }).eq("status", "manual_review_needed"),
      supabase.from("grant_links").select("id", { count: "exact", head: true }).eq("status", "failed"),
      supabase.from("grant_source_review_queue").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("grant_source_review_queue").select("id", { count: "exact", head: true }).eq("status", "pending").eq("kind", "source_candidate"),
      supabase.from("grant_source_review_queue").select("id", { count: "exact", head: true }).eq("status", "pending").eq("kind", "application_link"),
      supabase
        .from("grant_source_review_queue")
        .select("id, kind, source_name, endpoint, country, source_type, crawl_frequency, status, reason, grant_id, grant_link_id, created_at, updated_at", { count: "exact" })
        .eq("status", "pending")
        .order("updated_at", { ascending: false })
        .range(reviewQueueRange.from, reviewQueueRange.to),
      supabase.from("eligibility_deep_score_queue").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("eligibility_deep_score_queue").select("id", { count: "exact", head: true }).eq("status", "running"),
      supabase
        .from("eligibility_deep_score_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "completed")
        .gte("completed_at", todayStart.toISOString()),
      supabase.from("eligibility_deep_score_queue").select("id", { count: "exact", head: true }).eq("status", "failed"),
      supabase
        .from("eligibility_deep_score_queue")
        .select("id, organisation_id, profile_id, grant_id, status, heuristic_score, full_score, full_decision, attempts, last_error, updated_at")
        .order("updated_at", { ascending: false })
        .limit(8),
      supabase.from("eligibility_ai_score_cache").select("id", { count: "exact", head: true }),
      supabase.from("grant_ai_intelligence").select("grant_id", { count: "exact", head: true }).eq("status", "ready"),
      supabase.from("grant_ai_intelligence").select("grant_id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("grant_ai_intelligence").select("grant_id", { count: "exact", head: true }).eq("status", "failed"),
      supabase.from("grant_intelligence_queue").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("grant_intelligence_queue").select("id", { count: "exact", head: true }).eq("status", "running"),
      supabase
        .from("grant_intelligence_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "completed")
        .gte("completed_at", todayStart.toISOString()),
      supabase.from("grant_intelligence_queue").select("id", { count: "exact", head: true }).eq("status", "failed"),
      supabase
        .from("CronRunLog")
        .select("job_name, route, trigger, status, result, error, started_at, finished_at, duration_ms")
        .order("started_at", { ascending: false })
        .limit(1),
      supabase
        .from("CronRunLog")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed")
        .gte("started_at", todayStart.toISOString()),
      supabase
        .from("CronRunLog")
        .select("job_name, route, trigger, status, result, error, started_at, finished_at, duration_ms")
        .eq("status", "failed")
        .gte("started_at", todayStart.toISOString())
        .order("started_at", { ascending: false })
        .limit(6),
      supabase
        .from("CronRunLog")
        .select("job_name, route, trigger, status, result, error, started_at, finished_at, duration_ms", { count: "exact" })
        .gte("started_at", todayStart.toISOString())
        .order("started_at", { ascending: false })
        .range(cronRunsRange.from, cronRunsRange.to),
      supabase
        .from("SavedGrant")
        .select(
          "organisation_id, profile_id, grant_id, status, suppress_notifications, viewed_at, deferred_at, applied_at, dismissed_at, notes, created_at, updated_at",
          { count: "exact" }
        )
        .eq("suppress_notifications", true)
        .order("updated_at", { ascending: false })
        .range(suppressedRange.from, suppressedRange.to),
    ])
  );

  const notificationRows = (notificationResult.data ?? []) as NotificationLogRow[];
  const notificationDeliveryRows = (notificationDeliveryResult.data ?? []) as NotificationLogRow[];
  const sentUsersToday = distinctSentUsers(notificationRows, todayStart);
  const notificationUserIds = Array.from(
    new Set([...notificationRows, ...notificationDeliveryRows].map((row) => row.userId).filter(Boolean))
  ) as string[];

  let memberships: OrganisationMemberRow[] = [];
  let notificationUsers: UserRow[] = [];
  if (notificationUserIds.length > 0) {
    const [membershipResult, userResult] = await Promise.all([
      supabase
        .from("OrganisationMember")
        .select("userId, organisationId")
        .in("userId", notificationUserIds),
      supabase
        .from("User")
        .select("id, email")
        .in("id", notificationUserIds),
    ]);
    memberships = (membershipResult.data ?? []) as OrganisationMemberRow[];
    notificationUsers = (userResult.data ?? []) as UserRow[];
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
  const sourceImportRuns = (sourceImportRunsResult.data ?? []) as GrantSourceImportRunRow[];
  const sourceImportRunsToday = (sourceImportRunsTodayResult.data ?? []) as GrantSourceImportRunRow[];
  const grantDiscoveryRuns = (grantDiscoveryRunsResult.data ?? []) as CronRunLogRow[];
  const reviewQueueRows = (reviewQueueResult.data ?? []) as SourceReviewQueueRow[];
  const deepScoreRows = (deepScoreRowsResult.data ?? []) as DeepScoreQueueRow[];
  const grantSourceAttributionRows = (grantSourceAttributionResult.data ?? []) as GrantSourceAttributionRow[];
  const grantSourceCounts = (grantSourceCountRows ?? []) as GrantSourceCountRow[];
  const suppressedGrantRows = (suppressedGrantsResult.data ?? []) as SavedGrantSuppressionRow[];
  if (sourceImportRunsResult.error) {
    console.warn("[admin] Grant source import run query failed:", sourceImportRunsResult.error.message);
  }
  if (sourceImportRunsTodayResult.error) {
    console.warn("[admin] Grant source import summary query failed:", sourceImportRunsTodayResult.error.message);
  }
  if (grantDiscoveryRunsResult.error) {
    console.warn("[admin] Grant discovery provider activity query failed:", grantDiscoveryRunsResult.error.message);
  }
  if (grantSourceAttributionResult.error) {
    console.warn("[admin] Grant source attribution query failed:", grantSourceAttributionResult.error.message);
  }
  if (suppressedGrantsResult.error) {
    console.warn("[admin] SavedGrant suppression query failed:", suppressedGrantsResult.error.message);
  }
  if (cronRunsResult.error) {
    console.warn("[admin] CronRunLog query failed:", cronRunsResult.error.message);
  }
  if (reviewQueueResult.error) {
    console.warn("[admin] Grant source review queue query failed:", reviewQueueResult.error.message);
  }
  if (deepScoreRowsResult.error) {
    console.warn("[admin] Deep score queue query failed:", deepScoreRowsResult.error.message);
  }
  if (grantIntelligenceReadyResult.error) {
    console.warn("[admin] Grant intelligence query failed:", grantIntelligenceReadyResult.error.message);
  }
  if (grantIntelligenceQueuePendingResult.error) {
    console.warn("[admin] Grant intelligence queue query failed:", grantIntelligenceQueuePendingResult.error.message);
  }

  let suppressedGrantDetails: SuppressedGrantDetail[] = [];
  if (suppressedGrantRows.length > 0) {
    const suppressedGrantIds = uniqueStrings(suppressedGrantRows.map((row) => row.grant_id));
    const suppressedProfileIds = uniqueStrings(suppressedGrantRows.map((row) => row.profile_id));
    const suppressedOrganisationIds = uniqueStrings(suppressedGrantRows.map((row) => row.organisation_id));

    const [suppressedGrantDetailResult, suppressedProfileResult, suppressedOrganisationResult, suppressedAssessmentResult] =
      await Promise.all([
        suppressedGrantIds.length > 0
          ? supabase
              .from("Grant")
              .select("id, name, funder, source, deadline, createdAt, url_status")
              .in("id", suppressedGrantIds)
          : Promise.resolve({ data: [], error: null }),
        suppressedProfileIds.length > 0
          ? supabase
              .from("BusinessProfile")
              .select("id, businessName, business_name")
              .in("id", suppressedProfileIds)
          : Promise.resolve({ data: [], error: null }),
        suppressedOrganisationIds.length > 0
          ? supabase
              .from("Organisation")
              .select("id, name")
              .in("id", suppressedOrganisationIds)
          : Promise.resolve({ data: [], error: null }),
        suppressedGrantIds.length > 0 && suppressedProfileIds.length > 0
          ? supabase
              .from("EligibilityAssessment")
              .select("grant_id, profile_id, score, decision, summary, updated_at")
              .in("grant_id", suppressedGrantIds)
              .in("profile_id", suppressedProfileIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

    if (suppressedGrantDetailResult.error) {
      console.warn("[admin] Suppressed grant detail query failed:", suppressedGrantDetailResult.error.message);
    }
    if (suppressedProfileResult.error) {
      console.warn("[admin] Suppressed profile query failed:", suppressedProfileResult.error.message);
    }
    if (suppressedOrganisationResult.error) {
      console.warn("[admin] Suppressed organisation query failed:", suppressedOrganisationResult.error.message);
    }
    if (suppressedAssessmentResult.error) {
      console.warn("[admin] Suppressed assessment query failed:", suppressedAssessmentResult.error.message);
    }

    const grantsById = new Map(
      ((suppressedGrantDetailResult.data ?? []) as GrantRow[]).map((grant) => [grant.id, grant])
    );
    const profilesById = new Map(
      ((suppressedProfileResult.data ?? []) as ProfileSummaryRow[]).map((profile) => [profile.id, profile])
    );
    const organisationsById = new Map(
      ((suppressedOrganisationResult.data ?? []) as OrganisationSummaryRow[]).map((organisation) => [
        organisation.id,
        organisation,
      ])
    );
    const assessmentsByKey = new Map(
      ((suppressedAssessmentResult.data ?? []) as AssessmentSummaryRow[])
        .filter((assessment) => assessment.profile_id && assessment.grant_id)
        .map((assessment) => [`${assessment.profile_id}:${assessment.grant_id}`, assessment])
    );

    suppressedGrantDetails = suppressedGrantRows.map((row) => {
      const grant = row.grant_id ? grantsById.get(row.grant_id) : undefined;
      const profile = row.profile_id ? profilesById.get(row.profile_id) : undefined;
      const organisation = row.organisation_id ? organisationsById.get(row.organisation_id) : undefined;
      const assessment =
        row.profile_id && row.grant_id ? assessmentsByKey.get(`${row.profile_id}:${row.grant_id}`) : undefined;

      return {
        row,
        grantId: row.grant_id,
        grantName: grant?.name ?? row.grant_id ?? "Unknown grant",
        funder: grant?.funder ?? "Unknown funder",
        profileName: profileDisplayName(profile),
        organisationName: organisation?.name ?? row.organisation_id ?? "Unknown organisation",
        reason: suppressionReason(row),
        changedAt: suppressionChangedAt(row),
        grant,
        assessment,
      };
    });
  }

  const cronRuns = (cronRunsResult.data ?? []) as CronRunLogRow[];
  const aiDiscoveryActivity = discoveryActivityFromCronRuns(grantDiscoveryRuns);
  const sourceImportSummaryRows = summarizeSourceImportRuns(sourceImportRunsToday);
  const latestCronRun = ((latestCronRunResult.data ?? []) as CronRunLogRow[])[0] ?? null;
  const failedCronRunsTodayCount = failedCronRunsTodayResult.count ?? 0;
  const recentFailedCronRuns = (recentFailedCronRunsResult.data ?? []) as CronRunLogRow[];
  const dueSources = grantSources.filter((source) => isSourceDue(source)).length;
  const enabledSources = enabledGrantSourcesResult.count ?? grantSources.filter((source) => source.enabled).length;
  const latestSourceCrawl = grantSources
    .map((source) => source.last_crawled_at)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
  const sourceAttributionCounts = grantSourceCounts.length > 0
    ? grantSourceCounts
    : Array.from(
        grantSourceAttributionRows.reduce((counts, row) => {
          const key = grantSourceLabel(row.source);
          counts.set(key, (counts.get(key) ?? 0) + 1);
          return counts;
        }, new Map<string, number>())
      )
        .sort((a, b) => b[1] - a[1])
        .map(([label, today]) => ({
          label,
          detail: label.includes("search") ? "AI discovery" : "Registry, feed, API, or admin import",
          total: today,
          today,
        }));
  const aiDiscoveryProviders = discoveryProviderStatuses();
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
  const reviewQueue = {
    pending: reviewQueuePendingResult.count ?? reviewQueueRows.length,
    sourceCandidates: reviewQueueSourcePendingResult.count ?? 0,
    applicationLinks: reviewQueueLinkPendingResult.count ?? 0,
  };
  const deepScoreQueue = {
    pending: deepScorePendingResult.count ?? 0,
    running: deepScoreRunningResult.count ?? 0,
    completedToday: deepScoreCompletedTodayResult.count ?? 0,
    failed: deepScoreFailedResult.count ?? 0,
    cacheRows: aiScoreCacheResult.count ?? 0,
  };
  const grantIntelligence = {
    ready: grantIntelligenceReadyResult.count ?? 0,
    pending: grantIntelligencePendingResult.count ?? 0,
    failed: grantIntelligenceFailedResult.count ?? 0,
    queuePending: grantIntelligenceQueuePendingResult.count ?? 0,
    queueRunning: grantIntelligenceQueueRunningResult.count ?? 0,
    queueCompletedToday: grantIntelligenceQueueCompletedTodayResult.count ?? 0,
    queueFailed: grantIntelligenceQueueFailedResult.count ?? 0,
  };

  const notificationErrors = notificationRows
    .filter((row) => row.status === "failed" || row.status === "skipped")
    .slice(0, 5);
  const notificationUserEmailById = new Map(notificationUsers.map((row) => [row.id, row.email ?? row.id]));
  const recentNotificationDeliveries = notificationDeliveryRows;
  const totalSentToday = countNotifications(notificationRows, { since: todayStart, status: "sent" });
  const totalFailedToday = countNotifications(notificationRows, { since: todayStart, status: "failed" });
  const totalSkippedToday = countNotifications(notificationRows, { since: todayStart, status: "skipped" });
  const highMatchWhatsAppToday = countNotifications(notificationRows, {
    since: todayStart,
    type: "grant_match_high",
    channel: "whatsapp",
    status: "sent",
  });
  const deadlineEmailsToday =
    countNotifications(notificationRows, { since: todayStart, type: "deadline_reminder", channel: "email", status: "sent" }) +
    countNotifications(notificationRows, {
      since: todayStart,
      type: "deadline_daily_update",
      channel: "email",
      status: "sent",
    });
  const eligibilityEmailsToday =
    countNotifications(notificationRows, { since: todayStart, type: "grant_scan_digest", channel: "email", status: "sent" }) +
    countNotifications(notificationRows, {
      since: todayStart,
      type: "daily_grant_update",
      channel: "email",
      status: "sent",
    });
  const upgradePromptsToday = countNotifications(notificationRows, {
    since: todayStart,
    type: "eligibility_upgrade_prompt",
    channel: "email",
    status: "sent",
  });
  const matchHealthPromptsToday = countNotifications(notificationRows, {
    since: todayStart,
    type: "business_dna_match_health",
    channel: "email",
    status: "sent",
  });
  const organisationCountToday = distinctOrgCount(sentUsersToday, memberships);

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
                Daily admin report for {reportDateLabel} across grants, scoring, notifications, deadlines, and crawlers.
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
                <div className="text-3xl font-bold">{grantsTodayResult.count ?? 0}</div>
                <p className="mt-1 text-sm text-muted-foreground">Added today</p>
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
                <div className="text-3xl font-bold">{sentUsersToday.size}</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {organisationCountToday} organisations reached today
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
                <div className="text-3xl font-bold">{totalSentToday}</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {totalFailedToday} failed - {totalSkippedToday} skipped today
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
                <div className="text-3xl font-bold">{assessmentTodayResult.count ?? 0}</div>
                <p className="mt-1 text-sm text-muted-foreground">Score rows updated today</p>
              </CardContent>
            </Card>
            <Card className={failedCronRunsTodayCount > 0 ? "border-red-200 bg-red-50/60" : ""}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <ServerCrash className={`h-4 w-4 ${failedCronRunsTodayCount > 0 ? "text-red-600" : "text-blue-600"}`} />
                  Cron failures
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{failedCronRunsTodayCount}</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Failures logged today
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
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div className="rounded-md border bg-muted/30 p-3">
                    <div className="text-xs text-muted-foreground">Eligibility emails</div>
                    <div className="text-2xl font-semibold">{eligibilityEmailsToday}</div>
                  </div>
                  <div className="rounded-md border bg-muted/30 p-3">
                    <div className="text-xs text-muted-foreground">Upgrade prompts</div>
                    <div className="text-2xl font-semibold">{upgradePromptsToday}</div>
                  </div>
                  <div className="rounded-md border bg-muted/30 p-3">
                    <div className="text-xs text-muted-foreground">Deadline emails</div>
                    <div className="text-2xl font-semibold">{deadlineEmailsToday}</div>
                  </div>
                  <div className="rounded-md border bg-muted/30 p-3">
                    <div className="text-xs text-muted-foreground">Business DNA prompts</div>
                    <div className="text-2xl font-semibold">{matchHealthPromptsToday}</div>
                  </div>
                  <div className="rounded-md border bg-muted/30 p-3">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MessageCircle className="h-3.5 w-3.5" />
                      WhatsApp alerts
                    </div>
                    <div className="text-2xl font-semibold">{highMatchWhatsAppToday}</div>
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

            <Card className="min-w-0 overflow-hidden xl:col-span-2 2xl:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MessageCircle className="h-4 w-4 text-blue-600" />
                  Why no WhatsApp?
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-[28rem] space-y-3 overflow-y-auto pr-2 text-sm">
                <WhatsAppDiagnosticsPanel />
              </CardContent>
            </Card>

            <Card className="min-w-0 overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Brain className="h-4 w-4 text-blue-600" />
                  Grant intelligence
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-[32rem] space-y-3 overflow-y-auto pr-2 text-sm">
                <p className="text-sm text-muted-foreground">
                  Reusable AI extraction for grant criteria, hard gates, regions, applicant types, and semantic tags.
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <div className="rounded border bg-muted/30 p-2">
                    <div className="text-muted-foreground">Ready</div>
                    <div className="text-lg font-semibold text-emerald-700">{grantIntelligence.ready}</div>
                  </div>
                  <div className="rounded border bg-muted/30 p-2">
                    <div className="text-muted-foreground">Queue</div>
                    <div className="text-lg font-semibold">{grantIntelligence.queuePending}</div>
                  </div>
                  <div className="rounded border bg-muted/30 p-2">
                    <div className="text-muted-foreground">Running</div>
                    <div className="text-lg font-semibold">{grantIntelligence.queueRunning}</div>
                  </div>
                  <div className="rounded border bg-muted/30 p-2">
                    <div className="text-muted-foreground">Done today</div>
                    <div className="text-lg font-semibold text-emerald-700">{grantIntelligence.queueCompletedToday}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded border bg-muted/30 p-2">
                    <div className="text-muted-foreground">Pending cache</div>
                    <div className="text-lg font-semibold">{grantIntelligence.pending}</div>
                  </div>
                  <div className="rounded border bg-muted/30 p-2">
                    <div className="text-muted-foreground">Failed</div>
                    <div className="text-lg font-semibold text-red-700">{grantIntelligence.failed + grantIntelligence.queueFailed}</div>
                  </div>
                </div>
                <GrantIntelligenceActions />
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
                <PaginationControls
                  params={params}
                  pageKey="deadlinesPage"
                  page={deadlinesPage}
                  totalCount={upcomingDeadlineResult.count ?? upcomingDeadlines.length}
                  label="Deadlines"
                />
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
                  AI discovery providers
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-sm text-muted-foreground">
                  Runtime key status for grant discovery providers. Secret values are never displayed.
                </p>
                <div className="space-y-2">
                  {aiDiscoveryProviders.map((provider) => (
                    <div key={provider.label} className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 p-3">
                      <div className="min-w-0">
                        <div className="font-medium">{provider.label}</div>
                        <div className="text-xs text-muted-foreground">{provider.detail}</div>
                      </div>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-1 text-xs font-medium ${
                          provider.configured
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-amber-200 bg-amber-50 text-amber-700"
                        }`}
                      >
                        {provider.configured ? "Configured" : "Missing"}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  OpenAI remains required for trusted eligibility scoring; the other providers enrich source discovery when configured.
                </p>
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
                  <Database className="h-4 w-4 text-blue-600" />
                  Source enrichment
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-[28rem] space-y-3 overflow-y-auto pr-2 text-sm">
                <p className="text-sm text-muted-foreground">
                  Automated source imports show added feeds, skipped duplicates, rejected rows, and manual-review rows.
                </p>
                {sourceImportRuns.length > 0 ? (
                  <div className="space-y-2">
                    {sourceImportRuns.map((run, index) => (
                      <div key={`source-import-${run.created_at}-${index}`} className="rounded-md border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 truncate font-medium">
                            {run.run_source ?? "automation"}
                            {run.created_by ? ` · ${run.created_by}` : ""}
                          </div>
                          <div className="shrink-0 text-xs text-muted-foreground">{formatRelative(run.created_at)}</div>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                          <div className="rounded border bg-muted/30 p-2">
                            <div className="text-muted-foreground">Requested</div>
                            <div className="text-lg font-semibold">{run.requested_count ?? 0}</div>
                          </div>
                          <div className="rounded border bg-muted/30 p-2">
                            <div className="text-muted-foreground">Added</div>
                            <div className="text-lg font-semibold text-emerald-700">{run.added_count ?? 0}</div>
                          </div>
                          <div className="rounded border bg-muted/30 p-2">
                            <div className="text-muted-foreground">Duplicates</div>
                            <div className="text-lg font-semibold">{run.skipped_duplicate_count ?? 0}</div>
                          </div>
                          <div className="rounded border bg-muted/30 p-2">
                            <div className="text-muted-foreground">Review/reject</div>
                            <div className="text-lg font-semibold text-amber-700">
                              {(run.manual_review_count ?? 0) + (run.rejected_count ?? 0)}
                            </div>
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">{formatDateTime(run.created_at)}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">
                    No automated grant source import runs recorded yet.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="min-w-0 overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ClipboardCheck className="h-4 w-4 text-blue-600" />
                  Source review queue
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-[32rem] space-y-3 overflow-y-auto pr-2 text-sm">
                <p className="text-sm text-muted-foreground">
                  Manual-review source candidates and application links that did not auto-insert.
                </p>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded border bg-muted/30 p-2">
                    <div className="text-muted-foreground">Pending</div>
                    <div className="text-lg font-semibold">{reviewQueue.pending}</div>
                  </div>
                  <div className="rounded border bg-muted/30 p-2">
                    <div className="text-muted-foreground">Sources</div>
                    <div className="text-lg font-semibold">{reviewQueue.sourceCandidates}</div>
                  </div>
                  <div className="rounded border bg-muted/30 p-2">
                    <div className="text-muted-foreground">Grant links</div>
                    <div className="text-lg font-semibold">{reviewQueue.applicationLinks}</div>
                  </div>
                </div>
                <PaginationControls
                  params={params}
                  pageKey="reviewQueuePage"
                  page={reviewQueuePage}
                  totalCount={reviewQueueResult.count ?? reviewQueueRows.length}
                  label="Review queue"
                />
                {reviewQueueRows.length > 0 ? (
                  <div className="space-y-2">
                    {reviewQueueRows.map((row) => (
                      <div key={row.id} className="rounded-md border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium">
                              {row.source_name ?? row.endpoint ?? row.grant_id ?? "Review candidate"}
                            </div>
                            <div className="break-words text-xs text-muted-foreground">
                              {row.kind?.replaceAll("_", " ") ?? "candidate"} · {row.country ?? "Unknown region"} · {row.source_type ?? "source"}
                            </div>
                          </div>
                          <div className="shrink-0 text-xs text-muted-foreground">{formatRelative(row.updated_at ?? row.created_at)}</div>
                        </div>
                        {row.reason && (
                          <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                            {row.reason}
                          </div>
                        )}
                        <ReviewQueueActions id={row.id} kind={row.kind ?? "source_candidate"} endpoint={row.endpoint} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No pending review candidates.</p>
                )}
              </CardContent>
            </Card>

            <Card className="min-w-0 overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Brain className="h-4 w-4 text-blue-600" />
                  Deep eligibility scoring
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-[32rem] space-y-3 overflow-y-auto pr-2 text-sm">
                <p className="text-sm text-muted-foreground">
                  Batch converts preliminary heuristic rows into trusted company-DNA AI scores.
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                  <div className="rounded border bg-muted/30 p-2">
                    <div className="text-muted-foreground">Pending</div>
                    <div className="text-lg font-semibold">{deepScoreQueue.pending}</div>
                  </div>
                  <div className="rounded border bg-muted/30 p-2">
                    <div className="text-muted-foreground">Running</div>
                    <div className="text-lg font-semibold">{deepScoreQueue.running}</div>
                  </div>
                  <div className="rounded border bg-muted/30 p-2">
                    <div className="text-muted-foreground">Done today</div>
                    <div className="text-lg font-semibold text-emerald-700">{deepScoreQueue.completedToday}</div>
                  </div>
                  <div className="rounded border bg-muted/30 p-2">
                    <div className="text-muted-foreground">Failed</div>
                    <div className="text-lg font-semibold text-red-700">{deepScoreQueue.failed}</div>
                  </div>
                  <div className="rounded border bg-muted/30 p-2">
                    <div className="text-muted-foreground">AI cache</div>
                    <div className="text-lg font-semibold">{deepScoreQueue.cacheRows}</div>
                  </div>
                </div>
                <DeepScoreQueueActions />
                {deepScoreRows.length > 0 ? (
                  <div className="space-y-2">
                    {deepScoreRows.map((row) => (
                      <div key={row.id} className="rounded-md border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium">
                              {row.status ?? "pending"} · heuristic {row.heuristic_score ?? 0}%{row.full_score != null ? ` → ${row.full_score}%` : ""}
                            </div>
                            <div className="break-words text-xs text-muted-foreground">
                              org {row.organisation_id?.slice(0, 8) ?? "unknown"} · profile {row.profile_id?.slice(0, 8) ?? "unknown"} · grant {row.grant_id?.slice(0, 8) ?? "unknown"}
                            </div>
                          </div>
                          <div className="shrink-0 text-xs text-muted-foreground">{formatRelative(row.updated_at)}</div>
                        </div>
                        {row.last_error && (
                          <div className="mt-2 break-words rounded border border-red-200 bg-red-50 p-2 text-xs text-red-900">
                            {row.last_error}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No deep-score queue rows yet.</p>
                )}
              </CardContent>
            </Card>

            <Card className="min-w-0 overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <SearchCheck className="h-4 w-4 text-blue-600" />
                  Grant source attribution
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-[28rem] space-y-3 overflow-y-auto pr-2 text-sm">
                <p className="text-sm text-muted-foreground">
                  New grants added today, grouped by the final discovery/import route stored on the grant record.
                </p>
                {aiDiscoveryActivity.runs > 0 ? (
                  <div className="rounded-md border bg-blue-50/60 p-3">
                    <div className="font-medium text-blue-950">AI provider activity</div>
                    <div className="mt-1 text-xs text-blue-900/80">
                      Raw candidates from recent grant-discovery cron runs before dedupe, URL health checks, and final source attribution.
                    </div>
                    <div className="mt-3 grid gap-2 text-xs">
                      {AI_DISCOVERY_PROVIDER_KEYS.map((provider) => {
                        const stats = aiDiscoveryActivity.providerStats[provider.key];
                        return (
                        <div key={provider.key} className="rounded border border-blue-100 bg-white/70 p-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-medium">{provider.label}</div>
                            <div className="text-lg font-semibold">{stats.raw}</div>
                          </div>
                          <div className="mt-2 grid grid-cols-4 gap-1 text-center">
                            <div className="rounded border bg-emerald-50 p-1">
                              <div className="text-muted-foreground">Accepted</div>
                              <div className="font-semibold text-emerald-700">{stats.accepted}</div>
                            </div>
                            <div className="rounded border bg-muted/30 p-1">
                              <div className="text-muted-foreground">Dup</div>
                              <div className="font-semibold">{stats.duplicate}</div>
                            </div>
                            <div className="rounded border bg-amber-50 p-1">
                              <div className="text-muted-foreground">Rejected</div>
                              <div className="font-semibold text-amber-700">{stats.rejected}</div>
                            </div>
                            <div className="rounded border bg-red-50 p-1">
                              <div className="text-muted-foreground">Errors</div>
                              <div className="font-semibold text-red-700">{stats.errors}</div>
                            </div>
                          </div>
                          {stats.errorSamples.length > 0 && (
                            <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-red-900">
                              {stats.errorSamples[0]}
                            </div>
                          )}
                        </div>
                        );
                      })}
                    </div>
                    <div className="mt-2 text-xs text-blue-900/80">
                      Accepted today: {aiDiscoveryActivity.created} created, {aiDiscoveryActivity.updated} updated, {aiDiscoveryActivity.rejected} rejected across {aiDiscoveryActivity.runs} run{aiDiscoveryActivity.runs === 1 ? "" : "s"}.
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                    AI provider activity will appear after the next successful grant-discovery cron run logs provider counts.
                  </div>
                )}
                <div className="rounded-md border bg-muted/20 p-3">
                  <div className="font-medium">Source registry imports</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Today&apos;s source-feed imports. High duplicate counts mean the automation ran but found sources already in the registry.
                  </div>
                  <div className="mt-3 space-y-2">
                    {sourceImportSummaryRows.map((source) => (
                      <div key={source.key} className="rounded-md border bg-white/70 p-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium">{source.label}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              {source.latestCreatedBy ?? "No run today"}
                            </div>
                          </div>
                          <div className="shrink-0 text-xs text-muted-foreground">
                            {source.latestAt ? formatRelative(source.latestAt) : "No recent run"}
                          </div>
                        </div>
                        <div className="mt-2 grid grid-cols-5 gap-1 text-center text-xs">
                          <div className="rounded border bg-muted/30 p-1">
                            <div className="text-muted-foreground">Runs</div>
                            <div className="font-semibold">{source.runs}</div>
                          </div>
                          <div className="rounded border bg-muted/30 p-1">
                            <div className="text-muted-foreground">Req</div>
                            <div className="font-semibold">{source.requested}</div>
                          </div>
                          <div className="rounded border bg-muted/30 p-1">
                            <div className="text-muted-foreground">Added</div>
                            <div className="font-semibold text-emerald-700">{source.added}</div>
                          </div>
                          <div className="rounded border bg-muted/30 p-1">
                            <div className="text-muted-foreground">Dup</div>
                            <div className="font-semibold">{source.duplicates}</div>
                          </div>
                          <div className="rounded border bg-muted/30 p-1">
                            <div className="text-muted-foreground">Review</div>
                            <div className="font-semibold text-amber-700">{source.manualReview}</div>
                          </div>
                        </div>
                        {source.rejected > 0 && (
                          <div className="mt-2 rounded border border-red-200 bg-red-50 p-1 text-xs text-red-800">
                            {source.rejected} rejected
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                {sourceAttributionCounts.length > 0 ? (
                  <div className="space-y-2">
                    {sourceAttributionCounts.map((source) => (
                      <div key={source.label} className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 p-3">
                        <div className="min-w-0">
                          <div className="font-medium">{source.label}</div>
                          <div className="text-xs text-muted-foreground">
                            {source.detail}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-2xl font-semibold">{source.today}</div>
                          <div className="text-xs text-muted-foreground">{source.total} total</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No grant source attribution rows today.</p>
                )}
              </CardContent>
            </Card>

            <Card className="min-w-0 overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ServerCrash className={`h-4 w-4 ${failedCronRunsTodayCount > 0 ? "text-red-600" : "text-blue-600"}`} />
                  Cron runs
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-[28rem] space-y-3 overflow-y-auto pr-2 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border bg-muted/30 p-3">
                    <div className="text-xs text-muted-foreground">Failed today</div>
                    <div className="text-2xl font-semibold">{failedCronRunsTodayCount}</div>
                  </div>
                  <div className="rounded-md border bg-muted/30 p-3">
                    <div className="text-xs text-muted-foreground">Runs today</div>
                    <div className="text-2xl font-semibold">{cronRunsResult.count ?? cronRuns.length}</div>
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
                <PaginationControls
                  params={params}
                  pageKey="cronRunsPage"
                  page={cronRunsPage}
                  totalCount={cronRunsResult.count ?? cronRuns.length}
                  label="Cron runs"
                />
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
                  <p className="text-sm text-muted-foreground">No failed cron runs today.</p>
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
                      <th className="py-2 pr-4 font-medium">Sent today</th>
                      <th className="py-2 pr-4 font-medium">Email today</th>
                      <th className="py-2 pr-4 font-medium">WhatsApp today</th>
                      <th className="py-2 pr-4 font-medium">Failed today</th>
                      <th className="py-2 pr-4 font-medium">Skipped today</th>
                    </tr>
                  </thead>
                  <tbody>
                    {OPS_NOTIFICATION_TYPES.map((type) => (
                      <tr key={type} className="border-b last:border-0">
                        <td className="py-3 pr-4 font-medium">{NOTIFICATION_LABELS[type]}</td>
                        <td className="py-3 pr-4">{getStatusCount(notificationRows, type, "sent", todayStart)}</td>
                        <td className="py-3 pr-4">
                          {countNotifications(notificationRows, { since: todayStart, type, channel: "email", status: "sent" })}
                        </td>
                        <td className="py-3 pr-4">
                          {countNotifications(notificationRows, { since: todayStart, type, channel: "whatsapp", status: "sent" })}
                        </td>
                        <td className="py-3 pr-4">{getStatusCount(notificationRows, type, "failed", todayStart)}</td>
                        <td className="py-3 pr-4">{getStatusCount(notificationRows, type, "skipped", todayStart)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent notification deliveries</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-3">
                <PaginationControls
                  params={params}
                  pageKey="deliveriesPage"
                  page={deliveriesPage}
                  totalCount={notificationDeliveryResult.count ?? recentNotificationDeliveries.length}
                  label="Deliveries"
                />
              </div>
              <div className="max-h-[28rem] overflow-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-4 font-medium">Time</th>
                      <th className="py-2 pr-4 font-medium">Recipient</th>
                      <th className="py-2 pr-4 font-medium">Signal</th>
                      <th className="py-2 pr-4 font-medium">Channel</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                      <th className="py-2 pr-4 font-medium">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentNotificationDeliveries.length > 0 ? (
                      recentNotificationDeliveries.map((row, index) => {
                        const typeLabel =
                          row.type && row.type in NOTIFICATION_LABELS
                            ? NOTIFICATION_LABELS[row.type as OpsNotificationType]
                            : row.type ?? "Notification";
                        return (
                          <tr key={`${row.userId}-${row.type}-${row.channel}-${row.createdAt}-${index}`} className="border-b last:border-0">
                            <td className="py-3 pr-4 text-xs text-muted-foreground">{formatDateTime(row.createdAt)}</td>
                            <td className="py-3 pr-4">{row.userId ? notificationUserEmailById.get(row.userId) ?? row.userId : "Unknown"}</td>
                            <td className="py-3 pr-4">{typeLabel}</td>
                            <td className="py-3 pr-4">{row.channel ?? "unknown"}</td>
                            <td className="py-3 pr-4">
                              <span className={row.status === "failed" ? "font-medium text-red-600" : row.status === "skipped" ? "font-medium text-amber-700" : "text-emerald-700"}>
                                {row.status ?? "unknown"}
                              </span>
                            </td>
                            <td className="py-3 pr-4 text-xs text-muted-foreground">{row.error ?? "-"}</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-4 text-sm text-muted-foreground">
                          No notification delivery rows found today.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <EyeOff className="h-4 w-4 text-blue-600" />
                Suppressed grants
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Grants listed here are removed from repeated eligibility and deadline notifications for that profile.
                Saved-only and viewed grants stay active; deferred, applied, and dismissed states suppress reminders.
              </p>
              <div className="mt-4">
                <PaginationControls
                  params={params}
                  pageKey="suppressedPage"
                  page={suppressedPage}
                  totalCount={suppressedGrantsResult.count ?? suppressedGrantDetails.length}
                  label="Suppressed grants"
                />
              </div>
              <div className="mt-4 max-h-[30rem] overflow-auto">
                <table className="w-full min-w-[1120px] text-left text-sm">
                  <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-4 font-medium">Updated</th>
                      <th className="py-2 pr-4 font-medium">Organisation / profile</th>
                      <th className="py-2 pr-4 font-medium">Grant</th>
                      <th className="py-2 pr-4 font-medium">Reason</th>
                      <th className="py-2 pr-4 font-medium">Last score</th>
                      <th className="py-2 pr-4 font-medium">Deadline</th>
                      <th className="py-2 pr-4 font-medium">Notes</th>
                      <th className="py-2 pr-4 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suppressedGrantDetails.length > 0 ? (
                      suppressedGrantDetails.map((detail, index) => (
                        <tr key={`${detail.row.organisation_id}-${detail.row.profile_id}-${detail.row.grant_id}-${index}`} className="border-b last:border-0">
                          <td className="py-3 pr-4 text-xs text-muted-foreground">{formatDateTime(detail.changedAt)}</td>
                          <td className="py-3 pr-4">
                            <div className="font-medium">{detail.organisationName}</div>
                            <div className="text-xs text-muted-foreground">{detail.profileName}</div>
                          </td>
                          <td className="py-3 pr-4">
                            <div className="line-clamp-2 font-medium">{detail.grantName}</div>
                            <div className="text-xs text-muted-foreground">
                              {detail.funder}
                              {detail.grant?.url_status ? ` · link ${detail.grant.url_status}` : ""}
                            </div>
                          </td>
                          <td className="py-3 pr-4">
                            <span className="inline-flex rounded-full border bg-muted/40 px-2 py-0.5 text-xs font-medium">
                              {detail.row.status ?? "unknown"}
                            </span>
                            <div className="mt-1 max-w-[280px] text-xs text-muted-foreground">{detail.reason}</div>
                          </td>
                          <td className="py-3 pr-4">
                            {detail.assessment?.score != null ? (
                              <>
                                <div className="font-medium">{detail.assessment.score}%</div>
                                <div className="text-xs text-muted-foreground">
                                  {detail.assessment.decision ?? "decision unknown"} · {formatRelative(detail.assessment.updated_at)}
                                </div>
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground">No score row</span>
                            )}
                          </td>
                          <td className="py-3 pr-4 text-xs text-muted-foreground">{formatDateTime(detail.grant?.deadline)}</td>
                          <td className="py-3 pr-4">
                            <div className="max-w-[260px] text-xs text-muted-foreground">
                              {detail.row.notes ? detail.row.notes : "-"}
                            </div>
                          </td>
                          <td className="py-3 pr-4">
                            {detail.grantId ? (
                              <Link href={`/grants/${detail.grantId}`} className="text-sm font-medium text-blue-700 underline">
                                View grant
                              </Link>
                            ) : (
                              <span className="text-xs text-muted-foreground">Missing grant id</span>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={8} className="py-4 text-sm text-muted-foreground">
                          No suppressed grant rows found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Latest grants added</CardTitle>
              <p className="text-sm text-muted-foreground">
                Newest database records in 20-row batches.
              </p>
            </CardHeader>
            <CardContent>
              <div className="mb-3">
                <PaginationControls
                  params={params}
                  pageKey="latestGrantsPage"
                  page={latestGrantsPage}
                  totalCount={latestGrantsResult.count ?? latestGrants.length}
                  label="Latest grants"
                />
              </div>
              <div className="max-h-[28rem] overflow-y-auto pr-2">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  {latestGrants.length > 0 ? (
                    latestGrants.map((grant) => (
                      <div key={grant.id} className="rounded-md border p-3 text-sm">
                        <div className="line-clamp-2 font-medium">{grant.name ?? "Untitled grant"}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{grant.funder ?? "Unknown funder"}</div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          {grantSourceLabel(grant.source)} - {formatRelative(grant.createdAt)}
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
        <GrantSourceManager />
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
            <p className="mt-3 text-sm text-muted-foreground">
              Automated source enrichment can add RSS feeds or grant-source pages via{" "}
              <code className="rounded bg-muted px-1 py-0.5">POST /api/internal/grant-sources/import</code> with header{" "}
              <code className="rounded bg-muted px-1 py-0.5">x-internal-secret</code> and{" "}
              <code className="rounded bg-muted px-1 py-0.5">{`{ "sources": [...] }`}</code>. Duplicate endpoints are skipped.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
