import { getSupabaseAdmin } from "@/lib/supabase";
import { getEligibilityNotifyMinCompletion } from "@/lib/eligibility-notify-config";
import { planAllowsForOrg, resolvePlanKey } from "@/lib/plan-features";
import { grantMatchesFunderLocations, inferFunderLocationsFromProfile } from "@/lib/constants";
import { isGrantLinkUsable } from "@/lib/grant-freshness";
import { getAppliedGrantIds } from "@/lib/applied-grants";
import { getSuppressedGrantIds } from "@/lib/grant-user-state";
import { deriveOutcomeLearningAdvisory, type OutcomeLearningAdvisory } from "@/lib/outcome-learning";
import { finalEligibilityScore, finaliseEligibilityAssessment } from "@/lib/eligibility-final-score";
import type { EligibilityResult } from "@/lib/claude";
import { getMatchHealthReport, type MatchHealthReport } from "@/lib/match-health";

const DEFAULT_MIN_SCORE = 85;
const DEFAULT_MAX_SCORE = 100;
const DEFAULT_ELIGIBLE_THRESHOLD = 85;
const WHATSAPP_COOLDOWN_HOURS = 20;
const TRACE_BATCH_SIZE = 20;
const MAX_GRANTS_FOR_TRACE = 200;
const MAX_ASSESSMENTS_FOR_TRACE = 200;
const ELIGIBILITY_NOTIFICATION_TYPES = [
  "grant_scan_digest",
  "grant_match_high",
  "daily_grant_update",
  "eligibility_upgrade_prompt",
  "business_dna_match_health",
] as const;

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

type OrganisationRow = {
  id: string;
  name: string | null;
  plan: string | null;
  createdAt?: string | null;
  created_at?: string | null;
  preferredTimezone?: string | null;
};

type ProfileRow = {
  id: string;
  [key: string]: unknown;
  businessName?: string | null;
  business_name?: string | null;
  completionScore?: number | null;
  completion_score?: number | null;
  funderLocations?: string[] | null;
  funder_locations?: string[] | null;
  location?: string | null;
  country?: string | null;
  region?: string | null;
};

type PreferenceRow = {
  min_score?: number | null;
  max_score?: number | null;
  eligible_threshold?: number | null;
  notify_email?: boolean | null;
  notify_in_app?: boolean | null;
  notify_whatsapp?: boolean | null;
};

type NotifyUserRow = {
  id: string;
  email: string;
  phoneNumber: string | null;
  whatsappOptIn: boolean;
};

type NotificationLogTraceRow = {
  channel: string | null;
  type: string | null;
  status: string | null;
  error: string | null;
  createdAt: string | null;
  metadata?: unknown;
};

type EligibilityRow = {
  grant_id: string;
  score: number | null;
  decision: string | null;
  summary: string | null;
  notified_at: string | null;
  updated_at: string | null;
  missing_criteria?: string[] | null;
  improvement_plan?: EligibilityResult["improvementPlan"] | null;
  scoring_source?: string | null;
};

type CronRunTraceRow = {
  job_name: string | null;
  route: string | null;
  status: string | null;
  started_at: string | null;
  finished_at: string | null;
  result: unknown;
  error: string | null;
};

type GrantTraceRow = {
  id: string;
  name?: string | null;
  deadline?: string | null;
  eligibility?: string | null;
  description?: string | null;
  objectives?: string | null;
  applicantTypes?: string[];
  sectors?: string[];
  regions?: string[];
  funderLocations?: string[] | null;
  url_status?: string | null;
  createdAt?: string | null;
};

type ActionableGrantTrace = {
  ids: Set<string>;
  grantsById: Map<string, GrantTraceRow>;
  totalFetched: number;
  usableCurrent: number;
  locationMatched: number;
  applied: number;
  suppressed: number;
};

export type EligibilityWhatsAppReason =
  | "whatsapp_sent"
  | "no_profile"
  | "profile_completion_below_threshold"
  | "plan_blocked"
  | "email_disabled"
  | "whatsapp_disabled"
  | "no_phone"
  | "not_opted_in"
  | "template_missing"
  | "no_85_plus_candidates"
  | "already_notified"
  | "whatsapp_failed"
  | "missed_latest_run"
  | "ready_to_send_next_run";

export type EligibilityWhatsAppTrace = {
  orgId: string;
  orgName: string;
  plan: string;
  preferredTimezone: string | null;
  proactiveNotificationsAllowed: boolean;
  profile: {
    id: string;
    businessName: string;
    completionScore: number;
  } | null;
  preferences: {
    minScore: number;
    maxScore: number;
    eligibleThreshold: number;
    notifyEmail: boolean;
    notifyWhatsApp: boolean;
  };
  users: Array<{
    email: string;
    hasPhone: boolean;
    whatsappOptIn: boolean;
  }>;
  twilioGrantTemplateConfigured: boolean;
  latestEligibilityRun: {
    name: string;
    status: string;
    startedAt: string | null;
    finishedAt: string | null;
    error: string | null;
  } | null;
  highMatchCandidates: number;
  highMatchUnnotified: number;
  storedHighMatchCandidates: number;
  withinReachCandidates: number;
  grantScope: {
    fetched: number;
    usableCurrent: number;
    locationMatched: number;
    applied: number;
    suppressed: number;
  } | null;
  latestRunWhatsApp: {
    sent: number;
    failed: number;
    skipped: number;
    latestStatus: string | null;
    latestError: string | null;
    latestAt: string | null;
  };
  recentWhatsApp: {
    sent: number;
    failed: number;
    skipped: number;
    latestStatus: string | null;
    latestError: string | null;
    latestAt: string | null;
  };
  recentEligibilityEmail: {
    sent: number;
    failed: number;
    skipped: number;
    latestAt: string | null;
  };
  matchHealth: MatchHealthReport | null;
  finalReason: EligibilityWhatsAppReason;
  blockers: string[];
};

function completionScore(profile: ProfileRow | null): number {
  const raw = profile?.completionScore ?? profile?.completion_score ?? 0;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
}

function businessName(profile: ProfileRow | null): string {
  return profile?.businessName ?? profile?.business_name ?? "Business profile";
}

function notificationCounts(rows: NotificationLogTraceRow[], channel: string, types: string[]) {
  const scoped = rows.filter(
    (row) => row.channel === channel && row.type && types.includes(row.type) && !isAdminTestLog(row)
  );
  const latest = scoped[0] ?? null;
  return {
    sent: scoped.filter((row) => row.status === "sent").length,
    failed: scoped.filter((row) => row.status === "failed").length,
    skipped: scoped.filter((row) => row.status === "skipped").length,
    latestStatus: latest?.status ?? null,
    latestError: latest?.error ?? null,
    latestAt: latest?.createdAt ?? null,
  };
}

function isAdminTestLog(row: NotificationLogTraceRow): boolean {
  const metadata = row.metadata;
  if (!metadata || typeof metadata !== "object") return false;
  return (metadata as { source?: unknown }).source === "admin_test";
}

function isOutsideCooldown(value: string | null): boolean {
  if (!value) return true;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return true;
  return time < Date.now() - WHATSAPP_COOLDOWN_HOURS * 60 * 60 * 1000;
}

function toNotifyUser(raw: Record<string, unknown> | null | undefined): NotifyUserRow | null {
  if (!raw) return null;
  const id = typeof raw.id === "string" ? raw.id : "";
  const email = typeof raw.email === "string" ? raw.email : "";
  const phoneNumber = (raw.phoneNumber ?? raw.phone_number) as string | null | undefined;
  const whatsappOptIn = Boolean(raw.whatsappOptIn ?? raw.whatsapp_opt_in);
  if (!id || !email) return null;
  return {
    id,
    email,
    phoneNumber: phoneNumber ?? null,
    whatsappOptIn,
  };
}

async function getOrganisation(supabase: SupabaseAdmin, orgId: string): Promise<OrganisationRow | null> {
  const { data } = await supabase
    .from("Organisation")
    .select("id, name, plan, createdAt, preferredTimezone")
    .eq("id", orgId)
    .maybeSingle();
  return (data as OrganisationRow | null) ?? null;
}

async function getLatestProfile(supabase: SupabaseAdmin, orgId: string): Promise<ProfileRow | null> {
  let { data: rows = [] } = await supabase
    .from("BusinessProfile")
    .select("*")
    .eq("organisationId", orgId)
    .order("updatedAt", { ascending: false })
    .limit(1);

  if (!rows || rows.length === 0) {
    const fallback = await supabase
      .from("BusinessProfile")
      .select("*")
      .eq("organisation_id", orgId)
      .order("updatedAt", { ascending: false })
      .limit(1);
    rows = fallback.data ?? [];
  }

  return ((rows ?? []) as ProfileRow[])[0] ?? null;
}

async function getCurrentActionableGrantTrace(
  supabase: SupabaseAdmin,
  orgId: string,
  profile: ProfileRow
): Promise<ActionableGrantTrace> {
  const rows: GrantTraceRow[] = [];

  for (let offset = 0; offset < MAX_GRANTS_FOR_TRACE; offset += TRACE_BATCH_SIZE) {
    const { data, error } = await supabase
      .from("Grant")
      .select("id, name, deadline, eligibility, description, objectives, applicantTypes, sectors, regions, funderLocations, url_status, createdAt")
      .order("createdAt", { ascending: false })
      .range(offset, offset + TRACE_BATCH_SIZE - 1);

    if (error) {
      console.warn("[eligibility-diagnostics] grant trace lookup failed", error.message);
      break;
    }

    const batch = (data ?? []) as GrantTraceRow[];
    rows.push(...batch);
    if (batch.length < TRACE_BATCH_SIZE) break;
  }

  const usable = rows.filter(isGrantLinkUsable);
  const [appliedGrantIds, suppressedGrantIds] = await Promise.all([
    getAppliedGrantIds(supabase, orgId, profile.id),
    getSuppressedGrantIds(supabase, orgId, profile.id),
  ]);
  const actionable = usable.filter((grant) => !appliedGrantIds.has(grant.id) && !suppressedGrantIds.has(grant.id));
  const profileFunderLocations = Array.isArray(profile.funderLocations)
    ? profile.funderLocations
    : Array.isArray(profile.funder_locations)
      ? profile.funder_locations
      : null;
  const userFunderLocations = inferFunderLocationsFromProfile({
    funderLocations: profileFunderLocations,
    location: profile.location ?? null,
    country: profile.country ?? null,
    region: profile.region ?? null,
  });
  const locationMatched = actionable.filter((grant) =>
    grantMatchesFunderLocations(grant.funderLocations ?? [], userFunderLocations)
  );

  return {
    ids: new Set(locationMatched.map((grant) => grant.id)),
    grantsById: new Map(locationMatched.map((grant) => [grant.id, grant])),
    totalFetched: rows.length,
    usableCurrent: usable.length,
    locationMatched: locationMatched.length,
    applied: appliedGrantIds.size,
    suppressed: suppressedGrantIds.size,
  };
}

async function getOutcomeAdvisory(
  supabase: SupabaseAdmin,
  orgId: string,
  profileId: string
): Promise<OutcomeLearningAdvisory> {
  const { data } = await supabase
    .from("ApplicationOutcome")
    .select("outcome, awardedAmount, funderFeedback, learningNotes, Grant(name, funder)")
    .eq("organisationId", orgId)
    .eq("profileId", profileId)
    .order("reportedAt", { ascending: false })
    .limit(8);
  return deriveOutcomeLearningAdvisory(data ?? []);
}

async function getPreferences(supabase: SupabaseAdmin, orgId: string): Promise<PreferenceRow | null> {
  const { data } = await supabase
    .from("EligibilityNotificationPreference")
    .select("min_score, max_score, eligible_threshold, notify_email, notify_in_app, notify_whatsapp")
    .eq("organisation_id", orgId)
    .maybeSingle();
  return (data as PreferenceRow | null) ?? null;
}

async function getNotifyUsers(supabase: SupabaseAdmin, orgId: string): Promise<NotifyUserRow[]> {
  let { data: members = [] } = await supabase
    .from("OrganisationMember")
    .select("*, User(id, email, phoneNumber, whatsappOptIn)")
    .eq("organisationId", orgId)
    .neq("role", "VIEWER");

  if (!members?.length) {
    const fallback = await supabase
      .from("OrganisationMember")
      .select("*, User(id, email, phoneNumber, whatsappOptIn)")
      .eq("organisation_id", orgId)
      .neq("role", "VIEWER");
    members = fallback.data ?? [];
  }

  if (!members?.length) {
    const snakeFallback = await supabase
      .from("OrganisationMember")
      .select("*, User(id, email, phone_number, whatsapp_opt_in)")
      .eq("organisation_id", orgId)
      .neq("role", "VIEWER");
    members = snakeFallback.data ?? [];
  }

  return ((members ?? []) as Array<Record<string, unknown>>)
    .map((member) => toNotifyUser((member.User ?? member.user) as Record<string, unknown> | null))
    .filter((user): user is NotifyUserRow => Boolean(user));
}

async function getLatestEligibilityRun(supabase: SupabaseAdmin): Promise<CronRunTraceRow | null> {
  const { data } = await supabase
    .from("CronRunLog")
    .select("job_name, route, status, started_at, finished_at, result, error")
    .in("route", ["inngest/eligibility-refresh", "/api/cron/eligibility-refresh"])
    .order("started_at", { ascending: false })
    .limit(1);
  return ((data ?? []) as CronRunTraceRow[])[0] ?? null;
}

async function getAssessmentCounts(
  supabase: SupabaseAdmin,
  orgId: string,
  profileId: string,
  thresholds: { minScore: number; maxScore: number; eligibleThreshold: number },
  profile: ProfileRow,
  outcomeAdvisory: OutcomeLearningAdvisory,
  actionables?: ActionableGrantTrace
) {
  const matchRows: EligibilityRow[] = [];
  for (let offset = 0; offset < MAX_ASSESSMENTS_FOR_TRACE; offset += TRACE_BATCH_SIZE) {
    const { data = [], error } = await supabase
      .from("EligibilityAssessment")
      .select("grant_id, score, decision, summary, notified_at, updated_at, missing_criteria, improvement_plan, scoring_source")
      .eq("organisation_id", orgId)
      .eq("profile_id", profileId)
      .eq("scoring_source", "openai")
      .gte("score", 50)
      .lte("score", thresholds.maxScore)
      .order("updated_at", { ascending: false })
      .range(offset, offset + TRACE_BATCH_SIZE - 1);

    if (error) {
      console.warn("[eligibility-diagnostics] assessment trace lookup failed", error.message);
      break;
    }

    const batch = (data ?? []) as EligibilityRow[];
    matchRows.push(...batch);
    if (batch.length < TRACE_BATCH_SIZE) break;
  }

  const { count: storedHighMatchCandidates = 0 } = await supabase
    .from("EligibilityAssessment")
    .select("grant_id", { count: "exact", head: true })
    .eq("organisation_id", orgId)
    .eq("profile_id", profileId)
    .eq("decision", "likely_eligible")
    .eq("scoring_source", "openai")
    .gte("score", thresholds.eligibleThreshold)
    .lte("score", thresholds.maxScore);

  const currentRows = actionables ? matchRows.filter((row) => actionables.ids.has(row.grant_id)) : matchRows;
  const finalRows = currentRows
    .map((row) => {
      const grant = actionables?.grantsById.get(row.grant_id);
      if (!grant) return null;
      const finalResult = finaliseEligibilityAssessment(profile as Record<string, unknown>, grant, row, outcomeAdvisory);
      return {
        row,
        score: finalEligibilityScore(finalResult),
      };
    })
    .filter((item): item is { row: EligibilityRow; score: number } => item != null);
  const high = finalRows.filter((item) => item.score >= thresholds.eligibleThreshold && item.score <= thresholds.maxScore);
  const withinReach = finalRows.filter((item) => item.score >= 50 && item.score < thresholds.eligibleThreshold);

  return {
    highMatchCandidates: high.length,
    highMatchUnnotified: high.filter((item) => isOutsideCooldown(item.row.notified_at)).length,
    storedHighMatchCandidates: storedHighMatchCandidates ?? 0,
    withinReachCandidates: withinReach.length,
  };
}

async function getNotificationLogs(
  supabase: SupabaseAdmin,
  userIds: string[],
  since: Date
): Promise<NotificationLogTraceRow[]> {
  if (userIds.length === 0) return [];
  const { data = [] } = await supabase
    .from("NotificationLog")
    .select("channel, type, status, error, createdAt, metadata")
    .in("userId", userIds)
    .in("type", [
      ...ELIGIBILITY_NOTIFICATION_TYPES,
      "deadline_reminder",
      "deadline_daily_update",
    ])
    .gte("createdAt", since.toISOString())
    .order("createdAt", { ascending: false })
    .limit(200);
  return (data ?? []) as NotificationLogTraceRow[];
}

function decideFinalReason(params: {
  profile: ProfileRow | null;
  profileCompletion: number;
  notifyMinCompletion: number;
  proactiveNotificationsAllowed: boolean;
  notifyEmail: boolean;
  notifyWhatsApp: boolean;
  users: NotifyUserRow[];
  twilioGrantTemplateConfigured: boolean;
  highMatchCandidates: number;
  highMatchUnnotified: number;
  latestEligibilityRunStartedAt: string | null;
  latestRunWhatsApp: EligibilityWhatsAppTrace["latestRunWhatsApp"];
  recentWhatsApp: EligibilityWhatsAppTrace["recentWhatsApp"];
}): EligibilityWhatsAppReason {
  if (!params.profile) return "no_profile";
  if (params.profileCompletion < params.notifyMinCompletion) return "profile_completion_below_threshold";
  if (!params.proactiveNotificationsAllowed) return "plan_blocked";
  if (!params.notifyEmail) return "email_disabled";
  if (!params.notifyWhatsApp) return "whatsapp_disabled";
  if (!params.users.some((user) => user.phoneNumber)) return "no_phone";
  if (!params.users.some((user) => user.phoneNumber && user.whatsappOptIn)) return "not_opted_in";
  if (!params.twilioGrantTemplateConfigured) return "template_missing";
  if (params.highMatchCandidates === 0) return "no_85_plus_candidates";
  if (params.highMatchUnnotified === 0) return "already_notified";
  if (params.latestRunWhatsApp.failed > 0) return "whatsapp_failed";
  if (params.latestRunWhatsApp.sent > 0) return "whatsapp_sent";
  if (params.latestEligibilityRunStartedAt) return "missed_latest_run";
  return "ready_to_send_next_run";
}

function buildBlockers(trace: Omit<EligibilityWhatsAppTrace, "blockers" | "finalReason">, reason: EligibilityWhatsAppReason): string[] {
  const blockers: string[] = [];
  if (reason === "no_profile") blockers.push("No BusinessProfile found for this organisation.");
  if (reason === "profile_completion_below_threshold" && trace.profile) {
    blockers.push(
      `Profile completion is ${trace.profile.completionScore}%; eligibility notifications require ${getEligibilityNotifyMinCompletion()}% or higher.`
    );
  }
  if (reason === "plan_blocked") blockers.push("The organisation plan does not allow proactive notifications.");
  if (reason === "email_disabled") blockers.push("Eligibility email notifications are disabled.");
  if (reason === "whatsapp_disabled") blockers.push("Eligibility WhatsApp notifications are disabled.");
  if (reason === "no_phone") blockers.push("No non-viewer organisation member has a phone number.");
  if (reason === "not_opted_in") blockers.push("No non-viewer organisation member with a phone number has opted into WhatsApp.");
  if (reason === "template_missing") blockers.push("TWILIO_WHATSAPP_GRANT_MATCH_CONTENT_SID is not configured.");
  if (reason === "no_85_plus_candidates") {
    const stored = trace.storedHighMatchCandidates;
    const scoped = trace.grantScope;
    blockers.push(
      stored > 0
        ? `There are ${stored} stored 85%+ score rows, but none are current/actionable after expiry, location, applied, deferred, and dismissed filters.`
        : "No current OpenAI-scored likely eligible grants at or above the WhatsApp threshold."
    );
    if (scoped) {
      blockers.push(
        `Latest grant sample: ${scoped.locationMatched} location-matched, ${scoped.usableCurrent} usable, ${scoped.applied} applied, ${scoped.suppressed} suppressed.`
      );
    }
  }
  if (reason === "already_notified") blockers.push("85%+ matches exist, but they are still inside the notification cooldown or were already notified.");
  if (reason === "whatsapp_failed") blockers.push(trace.latestRunWhatsApp.latestError ?? "WhatsApp high-match send failed during the latest eligibility run.");
  if (reason === "missed_latest_run") {
    blockers.push("85%+ unnotified actionable matches exist, but no WhatsApp send/skip/fail log was written after the latest eligibility run.");
  }
  if (reason === "ready_to_send_next_run") blockers.push("85%+ unnotified matches exist and WhatsApp appears configured; the next run should send.");
  return blockers;
}

export async function getEligibilityWhatsAppTraceForOrg(
  orgId: string,
  options: { days?: number } = {}
): Promise<EligibilityWhatsAppTrace | null> {
  const supabase = getSupabaseAdmin();
  const days = Math.max(1, options.days ?? 7);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [org, profile, prefs, users, latestRun] = await Promise.all([
    getOrganisation(supabase, orgId),
    getLatestProfile(supabase, orgId),
    getPreferences(supabase, orgId),
    getNotifyUsers(supabase, orgId),
    getLatestEligibilityRun(supabase),
  ]);
  if (!org) return null;

  const plan = resolvePlanKey(org.plan);
  const proactiveNotificationsAllowed = planAllowsForOrg(
    { plan, createdAt: org.createdAt ?? org.created_at ?? null },
    "proactive_notifications"
  );
  const minScore = Math.max(Number(prefs?.min_score ?? DEFAULT_MIN_SCORE), 75);
  const maxScore = Number(prefs?.max_score ?? DEFAULT_MAX_SCORE);
  const eligibleThreshold = Math.max(Number(prefs?.eligible_threshold ?? DEFAULT_ELIGIBLE_THRESHOLD), 75);
  const notifyEmail = prefs?.notify_email !== false;
  const notifyWhatsApp = prefs?.notify_whatsapp ?? true;
  const [grantTrace, outcomeAdvisory, matchHealth]: [ActionableGrantTrace | null, OutcomeLearningAdvisory, MatchHealthReport | null] = profile
    ? await Promise.all([
        getCurrentActionableGrantTrace(supabase, orgId, profile),
        getOutcomeAdvisory(supabase, orgId, profile.id),
        getMatchHealthReport({ supabase, orgId, profile }),
      ])
    : [null, deriveOutcomeLearningAdvisory([]), null];
  const counts = profile
    ? await getAssessmentCounts(
        supabase,
        orgId,
        profile.id,
        { minScore, maxScore, eligibleThreshold },
        profile,
        outcomeAdvisory,
        grantTrace ?? undefined
      )
    : { highMatchCandidates: 0, highMatchUnnotified: 0, storedHighMatchCandidates: 0, withinReachCandidates: 0 };
  const logs = await getNotificationLogs(supabase, users.map((user) => user.id), since);
  const latestRunSince = latestRun?.started_at ? new Date(latestRun.started_at) : null;
  const logsSinceLatestRun = latestRunSince && Number.isFinite(latestRunSince.getTime())
    ? logs.filter((row) => {
        if (!row.createdAt) return false;
        const created = new Date(row.createdAt).getTime();
        return Number.isFinite(created) && created >= latestRunSince.getTime();
      })
    : [];
  const recentWhatsApp = notificationCounts(logs, "whatsapp", ["grant_match_high"]);
  const latestRunWhatsApp = notificationCounts(logsSinceLatestRun, "whatsapp", ["grant_match_high"]);
  const emailCounts = notificationCounts(logs, "email", [
    "grant_scan_digest",
    "daily_grant_update",
    "eligibility_upgrade_prompt",
  ]);
  const recentEligibilityEmail = {
    sent: emailCounts.sent,
    failed: emailCounts.failed,
    skipped: emailCounts.skipped,
    latestAt: emailCounts.latestAt,
  };
  const notifyMinCompletion = getEligibilityNotifyMinCompletion();
  const profileCompletion = completionScore(profile);
  const twilioGrantTemplateConfigured = Boolean((process.env.TWILIO_WHATSAPP_GRANT_MATCH_CONTENT_SID ?? "").trim());

  const baseTrace = {
    orgId,
    orgName: org.name ?? "Organisation",
    plan,
    preferredTimezone: org.preferredTimezone ?? null,
    proactiveNotificationsAllowed,
    profile: profile
      ? {
          id: profile.id,
          businessName: businessName(profile),
          completionScore: profileCompletion,
        }
      : null,
    preferences: {
      minScore,
      maxScore,
      eligibleThreshold,
      notifyEmail,
      notifyWhatsApp,
    },
    users: users.map((user) => ({
      email: user.email,
      hasPhone: Boolean(user.phoneNumber),
      whatsappOptIn: user.whatsappOptIn,
    })),
    twilioGrantTemplateConfigured,
    latestEligibilityRun: latestRun
      ? {
          name: latestRun.job_name ?? latestRun.route ?? "Eligibility refresh",
          status: latestRun.status ?? "unknown",
          startedAt: latestRun.started_at,
          finishedAt: latestRun.finished_at,
          error: latestRun.error,
        }
      : null,
    ...counts,
    grantScope: grantTrace
      ? {
          fetched: grantTrace.totalFetched,
          usableCurrent: grantTrace.usableCurrent,
          locationMatched: grantTrace.locationMatched,
          applied: grantTrace.applied,
          suppressed: grantTrace.suppressed,
        }
      : null,
    latestRunWhatsApp,
    recentWhatsApp,
    recentEligibilityEmail,
    matchHealth,
  };

  const finalReason = decideFinalReason({
    profile,
    profileCompletion,
    notifyMinCompletion,
    proactiveNotificationsAllowed,
    notifyEmail,
    notifyWhatsApp,
    users,
    twilioGrantTemplateConfigured,
    highMatchCandidates: counts.highMatchCandidates,
    highMatchUnnotified: counts.highMatchUnnotified,
    latestEligibilityRunStartedAt: latestRun?.started_at ?? null,
    latestRunWhatsApp,
    recentWhatsApp,
  });

  return {
    ...baseTrace,
    finalReason,
    blockers: buildBlockers(baseTrace, finalReason),
  };
}

export async function getAdminEligibilityWhatsAppTraces(options: {
  days?: number;
  limit?: number;
} = {}): Promise<EligibilityWhatsAppTrace[]> {
  const supabase = getSupabaseAdmin();
  const limit = Math.max(1, Math.min(options.limit ?? 8, 20));
  const { data: orgRows = [] } = await supabase
    .from("Organisation")
    .select("id")
    .order("updatedAt", { ascending: false })
    .limit(limit);

  const traces = await Promise.all(
    ((orgRows ?? []) as Array<{ id: string }>).map((org) =>
      getEligibilityWhatsAppTraceForOrg(org.id, { days: options.days })
    )
  );

  return traces.filter((trace): trace is EligibilityWhatsAppTrace => Boolean(trace));
}
