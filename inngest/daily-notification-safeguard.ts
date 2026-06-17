import { inngest } from "./client";
import { runWithCronLog } from "@/lib/cron-run-log";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isEligibilityNotificationTime } from "@/lib/timezone";
import { isGrantActionableNow } from "@/lib/grant-actionability";
import { getAppliedGrantIds } from "@/lib/applied-grants";
import { getSuppressedGrantIds } from "@/lib/grant-user-state";
import { grantMatchesFunderLocations, inferFunderLocationsFromProfile } from "@/lib/constants";
import { deriveOutcomeLearningAdvisory } from "@/lib/outcome-learning";
import { finalEligibilityScore, finaliseEligibilityAssessment, type EligibilityAssessmentLike } from "@/lib/eligibility-final-score";
import { isOutsideDigestGrantRepeatCooldown } from "@/lib/eligibility-digest-cooldown";
import { notifyOrgMembers, orgHasNotificationSince, type DigestGrantItem, type NotificationType } from "@/lib/notify";
import { organisationAllowsCapability } from "@/lib/plan-check";
import { createStartApplicationToken } from "@/lib/start-application-token";

const NOTIFY_COOLDOWN_HOURS = 20;
const DEFAULT_DIGEST_SCORE_THRESHOLD = 85;
const MIN_NOTIFICATION_SCORE_FLOOR = 75;
const GRANT_COUNT_BATCH_SIZE = 1000;
const MAX_GRANTS_TO_COUNT = 10000;
const DIGEST_ENQUEUE_CHUNK_SIZE = positiveIntFromEnv("ELIGIBILITY_DIGEST_ENQUEUE_CHUNK_SIZE", 100);
const DIGEST_WORKER_CONCURRENCY = positiveIntFromEnv("ELIGIBILITY_DIGEST_WORKER_CONCURRENCY", 25);
const DAILY_ELIGIBILITY_NOTIFICATION_TYPES: NotificationType[] = [
  "daily_grant_update",
  "grant_scan_digest",
  "grant_match_high",
  "eligibility_upgrade_prompt",
  "business_dna_match_health",
];

function positiveIntFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

type ProfileRow = {
  id?: string | null;
  organisationId?: string | null;
  organisation_id?: string | null;
  businessName?: string | null;
  business_name?: string | null;
  completionScore?: number | null;
  completion_score?: number | null;
  updatedAt?: string | null;
  updated_at?: string | null;
  funderLocations?: string[] | null;
  funder_locations?: string[] | null;
  location?: string | null;
  country?: string | null;
  region?: string | null;
};

type OrgRow = {
  id: string;
  preferredTimezone?: string | null;
  preferred_timezone?: string | null;
};

type PreferenceRow = {
  organisation_id?: string | null;
  min_score?: number | null;
  max_score?: number | null;
  eligible_threshold?: number | null;
  notify_email?: boolean | null;
};

type AssessmentDigestRow = EligibilityAssessmentLike & {
  grant_id?: string | null;
  updated_at?: string | null;
  notified_at?: string | null;
};

type GrantDigestRow = {
  id: string;
  name: string;
  funder?: string | null;
  url_status?: string | null;
  deadline?: string | null;
  eligibility?: string | null;
  description?: string | null;
  objectives?: string | null;
  funderLocations?: string[] | null;
  applicantTypes?: string[] | null;
  sectors?: string[] | null;
  regions?: string[] | null;
};

type DailyDigestEnqueueResult = {
  orgsWithProfile: number;
  orgsAtLocalTime: number;
  enqueued: number;
  failed: number;
  checkedGrantsCount: number;
  source: string;
  errors: string[];
};

function uniqueIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  return unique;
}

function profileOrgId(profile: ProfileRow): string | null {
  return profile.organisationId ?? profile.organisation_id ?? null;
}

function profileName(profile: ProfileRow | undefined): string {
  return profile?.businessName ?? profile?.business_name ?? "your business";
}

function profileCompletion(profile: ProfileRow | undefined): number {
  const raw = profile?.completionScore ?? profile?.completion_score ?? 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function profileUpdatedAt(profile: ProfileRow | undefined): number {
  const raw = profile?.updatedAt ?? profile?.updated_at;
  if (!raw) return 0;
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : 0;
}

function recentNotificationWindow(): Date {
  const since = new Date();
  since.setHours(since.getHours() - NOTIFY_COOLDOWN_HOURS);
  return since;
}

function zonedParts(timezone: string, date: Date) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function timezoneOffsetMs(timezone: string, date: Date): number {
  const parts = zonedParts(timezone, date);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - date.getTime();
}

function startOfLocalDayUtc(timezone: string, now = new Date()): Date {
  try {
    const parts = zonedParts(timezone, now);
    const localMidnightAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0);
    let offset = timezoneOffsetMs(timezone, new Date(localMidnightAsUtc));
    let result = new Date(localMidnightAsUtc - offset);
    const correctedOffset = timezoneOffsetMs(timezone, result);
    if (correctedOffset !== offset) {
      result = new Date(localMidnightAsUtc - correctedOffset);
    }
    return result;
  } catch {
    const fallback = new Date(now);
    fallback.setUTCHours(0, 0, 0, 0);
    return fallback;
  }
}

function notificationCooldownStart(timezone: string): Date {
  const rollingWindow = recentNotificationWindow();
  const localDayStart = startOfLocalDayUtc(timezone);
  return new Date(Math.max(rollingWindow.getTime(), localDayStart.getTime()));
}

function notificationMinScore(preferenceScore: number | undefined): number {
  return Math.max(preferenceScore ?? DEFAULT_DIGEST_SCORE_THRESHOLD, MIN_NOTIFICATION_SCORE_FLOOR);
}

function suggestedScoreThreshold(preferenceScore: number | null | undefined): number {
  return Math.max(DEFAULT_DIGEST_SCORE_THRESHOLD, notificationMinScore(preferenceScore ?? undefined));
}

async function markDigestItemsNotified(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  orgId: string,
  profileId: string,
  items: DigestGrantItem[]
): Promise<void> {
  const grantIds = Array.from(new Set(items.map((item) => item.grantId).filter(Boolean)));
  if (grantIds.length === 0) return;

  const { error } = await supabase
    .from("EligibilityAssessment")
    .update({ notified_at: new Date().toISOString() })
    .eq("organisation_id", orgId)
    .eq("profile_id", profileId)
    .in("grant_id", grantIds);

  if (error) {
    console.warn("[daily-notification-safeguard] failed to mark digest grants notified", error.message);
  }
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function asImprovementPlan(value: unknown): DigestGrantItem["improvementPlan"] {
  if (!value || typeof value !== "object") return null;
  const plan = value as { gaps?: unknown; actions?: unknown };
  const gaps = asStringArray(plan.gaps);
  const actions = asStringArray(plan.actions);
  return gaps.length > 0 || actions.length > 0 ? { gaps, actions } : null;
}

async function getOutcomeAdvisoryForProfile(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  orgId: string,
  profileId: string
) {
  const { data } = await supabase
    .from("ApplicationOutcome")
    .select("outcome, awardedAmount, funderFeedback, learningNotes, Grant(name, funder)")
    .eq("organisationId", orgId)
    .eq("profileId", profileId)
    .order("reportedAt", { ascending: false })
    .limit(8);
  return deriveOutcomeLearningAdvisory(data ?? []);
}

function profileFunderLocations(profile: ProfileRow): string[] {
  return inferFunderLocationsFromProfile({
    funderLocations: profile.funderLocations ?? profile.funder_locations ?? null,
    location: profile.location ?? null,
    country: profile.country ?? null,
    region: profile.region ?? null,
  });
}

async function getDigestHiddenGrantIds(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  orgId: string,
  profileId: string,
  candidateGrantIds: string[]
): Promise<Set<string>> {
  const hidden = await getSuppressedGrantIds(supabase, orgId, profileId);
  if (candidateGrantIds.length === 0) return hidden;

  const { data, error } = await supabase
    .from("SavedGrant")
    .select("grant_id, status")
    .eq("organisation_id", orgId)
    .eq("profile_id", profileId)
    .in("grant_id", candidateGrantIds);

  if (error) {
    console.warn("[daily-notification-safeguard] saved grant state lookup failed", error.message);
    return hidden;
  }

  for (const row of (data ?? []) as Array<{ grant_id?: string | null; status?: string | null }>) {
    if (!row.grant_id) continue;
    if (row.status === "deferred" || row.status === "applied" || row.status === "dismissed") {
      hidden.add(row.grant_id);
    }
  }

  return hidden;
}

function buildDigestGrantItem(params: {
  row: AssessmentDigestRow;
  grant: GrantDigestRow;
  profile: ProfileRow;
  orgId: string;
  profileId: string;
  maxScore: number;
  outcomeAdvisory: Awaited<ReturnType<typeof getOutcomeAdvisoryForProfile>>;
}): DigestGrantItem | null {
  const { row, grant, profile, orgId, profileId, maxScore, outcomeAdvisory } = params;
  const finalResult = finaliseEligibilityAssessment(
    profile as unknown as Record<string, unknown>,
    {
      ...grant,
      applicantTypes: grant.applicantTypes ?? undefined,
      sectors: grant.sectors ?? [],
      regions: grant.regions ?? [],
    },
    row,
    outcomeAdvisory
  );
  const score = finalEligibilityScore(finalResult);
  if (!Number.isFinite(score) || score < 50 || score > maxScore) return null;

  return {
    grantId: grant.id,
    grantName: grant.name,
    score,
    summary: finalResult.summary ?? finalResult.reason ?? row.summary ?? undefined,
    startApplicationToken: createStartApplicationToken({ grantId: grant.id, profileId, organisationId: orgId }),
    missingCriteria: finalResult.missing ?? asStringArray(row.missing_criteria),
    improvementPlan: finalResult.improvementPlan ?? asImprovementPlan(row.improvement_plan),
  };
}

async function countUsableGrants(supabase: ReturnType<typeof getSupabaseAdmin>): Promise<number> {
  let count = 0;

  for (let offset = 0; offset < MAX_GRANTS_TO_COUNT; offset += GRANT_COUNT_BATCH_SIZE) {
    const { data, error } = await supabase
      .from("Grant")
      .select("id, url_status, deadline, eligibility, description, objectives")
      .order("createdAt", { ascending: false })
      .range(offset, offset + GRANT_COUNT_BATCH_SIZE - 1);

    if (error) throw error;
    const batch = data ?? [];
    count += batch.filter((grant) => isGrantActionableNow(grant)).length;
    if (batch.length < GRANT_COUNT_BATCH_SIZE) break;
  }

  return count;
}

async function countStrongEligibleForOrg(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  orgId: string,
  profile: ProfileRow,
  minScore: number,
  maxScore: number
): Promise<number> {
  const profileId = profile.id;
  if (!profileId) return 0;

  const { data } = await supabase
    .from("EligibilityAssessment")
    .select("grant_id, score, decision, summary, missing_criteria, improvement_plan, scoring_source, updated_at, notified_at")
    .eq("organisation_id", orgId)
    .eq("profile_id", profileId)
    .eq("decision", "likely_eligible")
    .in("scoring_source", ["openai", "intelligence"])
    .gte("score", minScore)
    .lte("score", maxScore)
    .limit(200);

  const rows = (data ?? []) as AssessmentDigestRow[];
  const grantIds = [...new Set(rows
    .map((row) => row.grant_id)
    .filter((id): id is string => Boolean(id)))];
  if (grantIds.length === 0) return 0;

  const [appliedGrantIds, hiddenGrantIds, outcomeAdvisory, grantsResult] = await Promise.all([
    getAppliedGrantIds(supabase, orgId, profileId),
    getDigestHiddenGrantIds(supabase, orgId, profileId, grantIds),
    getOutcomeAdvisoryForProfile(supabase, orgId, profileId),
    supabase
      .from("Grant")
      .select("id, name, funder, url_status, deadline, eligibility, description, objectives, funderLocations, applicantTypes, sectors, regions")
      .in("id", grantIds),
  ]);

  const userFunderLocations = profileFunderLocations(profile);
  const grants = grantsResult.data ?? [];
  const grantById = new Map((grants as GrantDigestRow[]).map((grant) => [grant.id, grant]));
  let count = 0;
  for (const row of rows) {
    const grantId = row.grant_id;
    if (!grantId || appliedGrantIds.has(grantId) || hiddenGrantIds.has(grantId)) continue;
    if (!isOutsideDigestGrantRepeatCooldown(row.notified_at)) continue;
    const grant = grantById.get(grantId);
    if (!grant || !isGrantActionableNow(grant)) continue;
    if (!grantMatchesFunderLocations(grant.funderLocations ?? undefined, userFunderLocations)) continue;
    const item = buildDigestGrantItem({ row, grant, profile, orgId, profileId, maxScore, outcomeAdvisory });
    if (item && item.score >= minScore && item.score <= maxScore) count++;
  }

  return count;
}

async function buildCurrentDigestForProfile(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  orgId: string,
  profile: ProfileRow,
  minStrongScore: number,
  maxScore: number
): Promise<{ strong: DigestGrantItem[]; withinReach: DigestGrantItem[] }> {
  const profileId = profile.id;
  if (!profileId) return { strong: [], withinReach: [] };
  const withinReachMax = Math.min(maxScore, minStrongScore - 1);

  const { data, error } = await supabase
    .from("EligibilityAssessment")
    .select("grant_id, score, decision, summary, missing_criteria, improvement_plan, scoring_source, updated_at, notified_at")
    .eq("organisation_id", orgId)
    .eq("profile_id", profileId)
    .in("scoring_source", ["openai", "intelligence"])
    .gte("score", 50)
    .lte("score", maxScore)
    .order("score", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[daily-notification-safeguard] digest assessment query", error);
    return { strong: [], withinReach: [] };
  }

  const assessments = (data ?? []) as AssessmentDigestRow[];
  const grantIds = [...new Set(assessments.map((row) => row.grant_id).filter((id): id is string => Boolean(id)))];
  if (grantIds.length === 0) return { strong: [], withinReach: [] };

  const [appliedGrantIds, hiddenGrantIds, outcomeAdvisory, grantsResult] = await Promise.all([
    getAppliedGrantIds(supabase, orgId, profileId),
    getDigestHiddenGrantIds(supabase, orgId, profileId, grantIds),
    getOutcomeAdvisoryForProfile(supabase, orgId, profileId),
    supabase
      .from("Grant")
      .select("id, name, funder, url_status, deadline, eligibility, description, objectives, funderLocations, applicantTypes, sectors, regions")
      .in("id", grantIds),
  ]);

  const userFunderLocations = profileFunderLocations(profile);
  const grantById = new Map(((grantsResult.data ?? []) as GrantDigestRow[]).map((grant) => [grant.id, grant]));
  const items: DigestGrantItem[] = [];
  for (const row of assessments) {
    const grantId = row.grant_id;
    if (!grantId || appliedGrantIds.has(grantId) || hiddenGrantIds.has(grantId)) continue;
    if (!isOutsideDigestGrantRepeatCooldown(row.notified_at)) continue;
    const grant = grantById.get(grantId);
    if (!grant || !isGrantActionableNow(grant)) continue;
    if (!grantMatchesFunderLocations(grant.funderLocations ?? undefined, userFunderLocations)) continue;
    const item = buildDigestGrantItem({ row, grant, profile, orgId, profileId, maxScore, outcomeAdvisory });
    if (item) items.push(item);
  }

  const byScore = (a: DigestGrantItem, b: DigestGrantItem) => b.score - a.score;
  return {
    strong: items.filter((item) => item.score >= minStrongScore).sort(byScore).slice(0, 5),
    withinReach: withinReachMax >= 50
      ? items.filter((item) => item.score >= 50 && item.score <= withinReachMax).sort(byScore).slice(0, 4)
      : [],
  };
}

export async function runDailyNotificationSafeguardJob(options?: {
  orgIdsFilter?: Set<string>;
  respectLocalTime?: boolean;
  checkedGrantsCountOverride?: number;
}): Promise<{
  orgsWithProfile: number;
  orgsAtLocalTime: number;
  skippedRecent: number;
  skippedEmailPreference: number;
  dailyUpdates: number;
  upgradePrompts: number;
  checkedGrantsCount: number;
}> {
  const supabase = getSupabaseAdmin();
  const respectLocalTime = options?.respectLocalTime !== false;

  const checkedGrantsCount = Number.isFinite(options?.checkedGrantsCountOverride)
    ? Math.max(0, Math.round(Number(options?.checkedGrantsCountOverride)))
    : await countUsableGrants(supabase);

  const { data: profiles = [] } = await supabase
    .from("BusinessProfile")
    .select("id, organisationId, businessName, completionScore, updatedAt, funderLocations, location, country, region");

  const byOrg = new Map<string, ProfileRow[]>();
  for (const profile of (profiles ?? []) as ProfileRow[]) {
    const orgId = profileOrgId(profile);
    if (!orgId) continue;
    if (options?.orgIdsFilter && !options.orgIdsFilter.has(orgId)) continue;
    const existing = byOrg.get(orgId) ?? [];
    existing.push(profile);
    byOrg.set(orgId, existing);
  }

  const orgIds = Array.from(byOrg.keys());
  const diagnostics = {
    orgsWithProfile: orgIds.length,
    orgsAtLocalTime: 0,
    skippedRecent: 0,
    skippedEmailPreference: 0,
    dailyUpdates: 0,
    upgradePrompts: 0,
    checkedGrantsCount,
  };

  if (orgIds.length === 0) {
    console.info("[daily-notification-safeguard] No organisations with profiles", diagnostics);
    return diagnostics;
  }

  const { data: orgRows = [] } = await supabase
    .from("Organisation")
    .select("id, preferredTimezone")
    .in("id", orgIds);
  const orgs = new Map((orgRows ?? []).map((org) => [org.id, org as OrgRow]));

  const { data: prefRows = [] } = await supabase
    .from("EligibilityNotificationPreference")
    .select("organisation_id, min_score, max_score, eligible_threshold, notify_email")
    .in("organisation_id", orgIds);
  const prefs = new Map(
    ((prefRows ?? []) as PreferenceRow[])
      .filter((pref) => Boolean(pref.organisation_id))
      .map((pref) => [pref.organisation_id as string, pref])
  );

  for (const orgId of orgIds) {
    const org = orgs.get(orgId);
    const timezone = org?.preferredTimezone ?? org?.preferred_timezone ?? "UTC";
    if (respectLocalTime && !isEligibilityNotificationTime(timezone)) continue;
    diagnostics.orgsAtLocalTime++;
    const recentWindow = notificationCooldownStart(timezone);

    const pref = prefs.get(orgId);
    if (pref?.notify_email === false) {
      diagnostics.skippedEmailPreference++;
      continue;
    }

    const alreadyDelivered = await orgHasNotificationSince(
      orgId,
      [...DAILY_ELIGIBILITY_NOTIFICATION_TYPES],
      recentWindow
    );
    if (alreadyDelivered) {
      diagnostics.skippedRecent++;
      continue;
    }

    const profilesForOrg = byOrg.get(orgId) ?? [];
    const primaryProfile = [...profilesForOrg].sort((a, b) => {
      const completionDelta = profileCompletion(b) - profileCompletion(a);
      if (completionDelta !== 0) return completionDelta;
      return profileUpdatedAt(b) - profileUpdatedAt(a);
    })[0];
    const maxScore = pref?.max_score ?? 100;
    const minScore = suggestedScoreThreshold(pref?.eligible_threshold);
    const matchedGrantsCount = primaryProfile?.id
      ? await countStrongEligibleForOrg(supabase, orgId, primaryProfile, minScore, maxScore)
      : 0;
    const canReceiveProactiveNotifications = await organisationAllowsCapability(orgId, "proactive_notifications");

    if (!canReceiveProactiveNotifications) {
      await notifyOrgMembers(
        orgId,
        "eligibility_upgrade_prompt",
        {
          profileName: profileName(primaryProfile),
          matchedGrantsCount,
        },
        { sendEmail: true, sendWhatsApp: false }
      );
      diagnostics.upgradePrompts++;
      continue;
    }

    if (primaryProfile?.id && canReceiveProactiveNotifications) {
      const digest = await buildCurrentDigestForProfile(supabase, orgId, primaryProfile, minScore, maxScore);
      if (digest.strong.length > 0 || digest.withinReach.length > 0) {
        await notifyOrgMembers(
          orgId,
          "grant_scan_digest",
          {
            profileName: profileName(primaryProfile),
            grants: digest.strong,
            withinReachGrants: digest.withinReach,
          },
          { sendEmail: true, sendWhatsApp: false }
        );
        await markDigestItemsNotified(supabase, orgId, primaryProfile.id, [
          ...digest.strong,
          ...digest.withinReach,
        ]);
        diagnostics.dailyUpdates++;
        continue;
      }
    }

    await notifyOrgMembers(
      orgId,
      "daily_grant_update",
      {
        profileName: profileName(primaryProfile),
        checkedGrantsCount,
        matchedGrantsCount,
      },
      { sendEmail: true, sendWhatsApp: false }
    );
    diagnostics.dailyUpdates++;
  }

  console.info("[daily-notification-safeguard] Complete", diagnostics);
  return diagnostics;
}

export async function enqueueDailyEligibilityDigests(options: {
  source: string;
  respectLocalTime?: boolean;
}): Promise<DailyDigestEnqueueResult> {
  const supabase = getSupabaseAdmin();
  const respectLocalTime = options.respectLocalTime !== false;

  const { data: profiles = [] } = await supabase
    .from("BusinessProfile")
    .select("organisationId");

  const orgIds = uniqueIds(
    ((profiles ?? []) as ProfileRow[])
      .map((profile) => profileOrgId(profile))
      .filter((id): id is string => Boolean(id))
  );

  const diagnostics: DailyDigestEnqueueResult = {
    orgsWithProfile: orgIds.length,
    orgsAtLocalTime: 0,
    enqueued: 0,
    failed: 0,
    checkedGrantsCount: 0,
    source: options.source,
    errors: [],
  };

  if (orgIds.length === 0) return diagnostics;

  const { data: orgRows = [], error: orgError } = await supabase
    .from("Organisation")
    .select("id, preferredTimezone")
    .in("id", orgIds);
  if (orgError) throw orgError;

  const dueOrgIds = ((orgRows ?? []) as OrgRow[])
    .filter((org) => !respectLocalTime || isEligibilityNotificationTime(org.preferredTimezone ?? org.preferred_timezone ?? "UTC"))
    .map((org) => org.id);
  diagnostics.orgsAtLocalTime = dueOrgIds.length;

  if (dueOrgIds.length === 0) return diagnostics;

  const checkedGrantsCount = await countUsableGrants(supabase);
  diagnostics.checkedGrantsCount = checkedGrantsCount;
  const dateKey = new Date().toISOString().slice(0, 10);

  for (let offset = 0; offset < dueOrgIds.length; offset += DIGEST_ENQUEUE_CHUNK_SIZE) {
    const chunk = dueOrgIds.slice(offset, offset + DIGEST_ENQUEUE_CHUNK_SIZE);
    try {
      await inngest.send(chunk.map((orgId) => ({
        id: `eligibility-digest:${orgId}:${dateKey}`,
        name: "eligibility/digest.requested",
        data: {
          orgId,
          source: options.source,
          checkedGrantsCount,
        },
      })));
      diagnostics.enqueued += chunk.length;
    } catch (error) {
      diagnostics.failed += chunk.length;
      diagnostics.errors.push(`orgs ${offset + 1}-${offset + chunk.length}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  diagnostics.errors = diagnostics.errors.slice(0, 10);
  return diagnostics;
}

export const dailyNotificationDigestRequested = inngest.createFunction(
  {
    id: "daily-notification-digest-requested",
    name: "Daily eligibility digest per organisation",
    concurrency: DIGEST_WORKER_CONCURRENCY,
  },
  { event: "eligibility/digest.requested" },
  async ({ event }) => {
    const orgId = typeof event.data?.orgId === "string" ? event.data.orgId.trim() : "";
    if (!orgId) return { skipped: true, reason: "missing_org_id" };
    const checkedGrantsCount = Number(event.data?.checkedGrantsCount);
    return runWithCronLog(
      { jobName: "Daily Eligibility Digest", route: "inngest/daily-notification-digest.requested", trigger: "inngest" },
      () => runDailyNotificationSafeguardJob({
        orgIdsFilter: new Set([orgId]),
        respectLocalTime: false,
        checkedGrantsCountOverride: Number.isFinite(checkedGrantsCount) ? checkedGrantsCount : undefined,
      })
    );
  }
);

export const dailyNotificationSafeguard = inngest.createFunction(
  { id: "daily-notification-safeguard", name: "Daily Eligibility Digest Sender" },
  { cron: "30 * * * *" },
  async () => runWithCronLog(
    { jobName: "Daily Notification Safeguard", route: "inngest/daily-notification-safeguard", trigger: "inngest" },
    () => enqueueDailyEligibilityDigests({ source: "scheduled.daily_digest", respectLocalTime: true })
  )
);
