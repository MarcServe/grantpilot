import { inngest } from "./client";
import { runWithCronLog } from "@/lib/cron-run-log";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isEligibilityNotificationCatchUpTime } from "@/lib/timezone";
import { isGrantActionableNow } from "@/lib/grant-actionability";
import { getAppliedGrantIds } from "@/lib/applied-grants";
import { getSuppressedGrantIds } from "@/lib/grant-user-state";
import { grantMatchesFunderLocations, inferFunderLocationsFromProfile } from "@/lib/constants";
import { deriveOutcomeLearningAdvisory } from "@/lib/outcome-learning";
import { finalEligibilityScore, finaliseEligibilityAssessment, type EligibilityAssessmentLike } from "@/lib/eligibility-final-score";
import { notifyOrgMembers, orgHasNotificationChannelSince, orgHasNotificationSince, type DigestGrantItem, type NotificationType } from "@/lib/notify";
import { organisationAllowsCapability } from "@/lib/plan-check";
import { createStartApplicationToken } from "@/lib/start-application-token";
import { getEligibilityNotifyMinCompletion } from "@/lib/eligibility-notify-config";
import { isMissingGrantUrlQualityColumnsError } from "@/lib/grant-url-quality-columns";

const NOTIFY_COOLDOWN_HOURS = 20;
const DEFAULT_DIGEST_SCORE_THRESHOLD = 85;
const MIN_NOTIFICATION_SCORE_FLOOR = 75;
const GRANT_COUNT_BATCH_SIZE = 1000;
const MAX_GRANTS_TO_COUNT = 10000;
const DIGEST_ENQUEUE_CHUNK_SIZE = positiveIntFromEnv("ELIGIBILITY_DIGEST_ENQUEUE_CHUNK_SIZE", 100);
const DIGEST_WORKER_CONCURRENCY = positiveIntFromEnv("ELIGIBILITY_DIGEST_WORKER_CONCURRENCY", 25);
const DIGEST_STRONG_LIMIT = positiveIntFromEnv("ELIGIBILITY_DIGEST_STRONG_LIMIT", 20);
const DIGEST_PREVIOUS_LIMIT = positiveIntFromEnv("ELIGIBILITY_DIGEST_PREVIOUS_LIMIT", 12);
const DIGEST_OTHER_LIMIT = positiveIntFromEnv("ELIGIBILITY_DIGEST_OTHER_LIMIT", 4);
const GRANT_DIGEST_SELECT_BASE =
  "id, name, funder, url_status, deadline, createdAt, eligibility, description, objectives, funderLocations, applicantTypes, sectors, regions, applicationUrl";
const GRANT_DIGEST_SELECT_WITH_URL_QUALITY =
  `${GRANT_DIGEST_SELECT_BASE}, directApplicationUrl, applicationUrlQuality, applicationUrlKind`;
const DAILY_ELIGIBILITY_NOTIFICATION_TYPES: NotificationType[] = [
  "daily_grant_update",
  "grant_scan_digest",
  "grant_match_high",
  "eligibility_upgrade_prompt",
  "business_dna_match_health",
  "profile_completion_reminder",
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
  notify_whatsapp?: boolean | null;
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
  createdAt?: string | null;
  created_at?: string | null;
  eligibility?: string | null;
  description?: string | null;
  objectives?: string | null;
  funderLocations?: string[] | null;
  applicantTypes?: string[] | null;
  sectors?: string[] | null;
  regions?: string[] | null;
  applicationUrl?: string | null;
  directApplicationUrl?: string | null;
  applicationUrlQuality?: string | null;
  applicationUrlKind?: string | null;
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

async function fetchDigestGrantRowsByIds(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  grantIds: string[],
  context: string
): Promise<GrantDigestRow[]> {
  if (grantIds.length === 0) return [];

  const full = await supabase
    .from("Grant")
    .select(GRANT_DIGEST_SELECT_WITH_URL_QUALITY)
    .in("id", grantIds);

  if (!full.error) return (full.data ?? []) as GrantDigestRow[];

  if (!isMissingGrantUrlQualityColumnsError(full.error)) {
    console.error(`[daily-notification-safeguard] ${context} grant lookup failed`, full.error.message ?? full.error);
    return [];
  }

  console.warn(
    `[daily-notification-safeguard] ${context} URL-quality Grant columns unavailable; using base Grant columns`
  );
  const fallback = await supabase
    .from("Grant")
    .select(GRANT_DIGEST_SELECT_BASE)
    .in("id", grantIds);

  if (fallback.error) {
    console.error(
      `[daily-notification-safeguard] ${context} fallback grant lookup failed`,
      fallback.error.message ?? fallback.error
    );
    return [];
  }

  return (fallback.data ?? []) as GrantDigestRow[];
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
    const offset = timezoneOffsetMs(timezone, new Date(localMidnightAsUtc));
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
  const hidden = await getSuppressedGrantIds(supabase, orgId, profileId, { includeViewed: true });
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
    if (row.status === "viewed" || row.status === "deferred" || row.status === "applied" || row.status === "dismissed") {
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
  if (!Number.isFinite(score) || score < 1 || score > maxScore) return null;

  return {
    grantId: grant.id,
    grantName: grant.name,
    score,
    applicationUrlQuality: grant.applicationUrlQuality ?? null,
    applicationUrlKind: grant.applicationUrlKind ?? null,
    scoringSource: row.scoring_source ?? null,
    scoredAt: row.updated_at ?? null,
    grantAddedAt: grant.createdAt ?? grant.created_at ?? null,
    summary: finalResult.summary ?? finalResult.reason ?? row.summary ?? undefined,
    startApplicationToken: createStartApplicationToken({ grantId: grant.id, profileId, organisationId: orgId }),
    missingCriteria: finalResult.missing ?? asStringArray(row.missing_criteria),
    improvementPlan: finalResult.improvementPlan ?? asImprovementPlan(row.improvement_plan),
  };
}

function digestScoredTime(item: DigestGrantItem): number {
  if (!item.scoredAt) return 0;
  const time = new Date(item.scoredAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

function digestGrantAddedTime(item: DigestGrantItem): number {
  if (!item.grantAddedAt) return 0;
  const time = new Date(item.grantAddedAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

function sortDigestByFreshScore(a: DigestGrantItem, b: DigestGrantItem): number {
  const addedDelta = digestGrantAddedTime(b) - digestGrantAddedTime(a);
  if (addedDelta !== 0) return addedDelta;
  if (b.score !== a.score) return b.score - a.score;
  const scoredDelta = digestScoredTime(b) - digestScoredTime(a);
  if (scoredDelta !== 0) return scoredDelta;
  return a.grantName.localeCompare(b.grantName);
}

function dedupeDigestItems(items: DigestGrantItem[]): DigestGrantItem[] {
  const seen = new Set<string>();
  const unique: DigestGrantItem[] = [];
  for (const item of items) {
    if (!item.grantId || seen.has(item.grantId)) continue;
    seen.add(item.grantId);
    unique.push(item);
  }
  return unique;
}

function hasStrongWhatsAppMatches(items: DigestGrantItem[], minScore: number): boolean {
  return items.some(
    (item) =>
      item.score >= minScore &&
      (item.scoringSource === "openai" || item.scoringSource === "intelligence")
  );
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

  const [appliedGrantIds, hiddenGrantIds, outcomeAdvisory, grants] = await Promise.all([
    getAppliedGrantIds(supabase, orgId, profileId),
    getDigestHiddenGrantIds(supabase, orgId, profileId, grantIds),
    getOutcomeAdvisoryForProfile(supabase, orgId, profileId),
    fetchDigestGrantRowsByIds(supabase, grantIds, "strong-count"),
  ]);

  const userFunderLocations = profileFunderLocations(profile);
  const grantById = new Map(grants.map((grant) => [grant.id, grant]));
  let count = 0;
  for (const row of rows) {
    const grantId = row.grant_id;
    if (!grantId || appliedGrantIds.has(grantId) || hiddenGrantIds.has(grantId)) continue;
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
): Promise<{ strong: DigestGrantItem[]; withinReach: DigestGrantItem[]; other: DigestGrantItem[]; previous: DigestGrantItem[] }> {
  const profileId = profile.id;
  if (!profileId) return { strong: [], withinReach: [], other: [], previous: [] };
  const withinReachMax = Math.min(maxScore, minStrongScore - 1);

  const strongQuery = supabase
    .from("EligibilityAssessment")
    .select("grant_id, score, decision, summary, missing_criteria, improvement_plan, scoring_source, updated_at, notified_at")
    .eq("organisation_id", orgId)
    .eq("profile_id", profileId)
    .eq("decision", "likely_eligible")
    .in("scoring_source", ["openai", "intelligence"])
    .gte("score", minStrongScore)
    .lte("score", maxScore)
    .order("updated_at", { ascending: false })
    .order("score", { ascending: false })
    .limit(Math.max(DIGEST_STRONG_LIMIT + DIGEST_PREVIOUS_LIMIT, 80));

  const withinReachQuery = withinReachMax >= 50
    ? supabase
      .from("EligibilityAssessment")
      .select("grant_id, score, decision, summary, missing_criteria, improvement_plan, scoring_source, updated_at, notified_at")
      .eq("organisation_id", orgId)
      .eq("profile_id", profileId)
      .in("scoring_source", ["openai", "intelligence"])
      .gte("score", 50)
      .lte("score", withinReachMax)
      .order("updated_at", { ascending: false })
      .order("score", { ascending: false })
      .limit(80)
    : Promise.resolve({ data: [], error: null });

  const otherQuery = supabase
    .from("EligibilityAssessment")
    .select("grant_id, score, decision, summary, missing_criteria, improvement_plan, scoring_source, updated_at, notified_at")
    .eq("organisation_id", orgId)
    .eq("profile_id", profileId)
    .in("scoring_source", ["openai", "intelligence"])
    .gte("score", 1)
    .lt("score", 50)
    .order("updated_at", { ascending: false })
    .order("score", { ascending: false })
    .limit(60);

  const previousQuery = supabase
    .from("EligibilityAssessment")
    .select("grant_id, score, decision, summary, missing_criteria, improvement_plan, scoring_source, updated_at, notified_at")
    .eq("organisation_id", orgId)
    .eq("profile_id", profileId)
    .eq("decision", "likely_eligible")
    .in("scoring_source", ["openai", "intelligence"])
    .gte("score", minStrongScore)
    .lte("score", maxScore)
    .not("notified_at", "is", null)
    .order("notified_at", { ascending: false })
    .limit(100);

  const [strongResult, withinReachResult, otherResult, previousResult] = await Promise.all([
    strongQuery,
    withinReachQuery,
    otherQuery,
    previousQuery,
  ]);

  const firstError = strongResult.error ?? withinReachResult.error ?? otherResult.error ?? previousResult.error;
  if (firstError) {
    console.error("[daily-notification-safeguard] digest assessment query", firstError);
    return { strong: [], withinReach: [], other: [], previous: [] };
  }

  const strongRows = (strongResult.data ?? []) as AssessmentDigestRow[];
  const withinReachRows = (withinReachResult.data ?? []) as AssessmentDigestRow[];
  const otherRows = (otherResult.data ?? []) as AssessmentDigestRow[];
  const previousRows = (previousResult.data ?? []) as AssessmentDigestRow[];
  const assessments = [...strongRows, ...withinReachRows, ...otherRows, ...previousRows];
  const grantIds = [...new Set(assessments.map((row) => row.grant_id).filter((id): id is string => Boolean(id)))];
  if (grantIds.length === 0) return { strong: [], withinReach: [], other: [], previous: [] };

  const [appliedGrantIds, hiddenGrantIds, outcomeAdvisory, grants] = await Promise.all([
    getAppliedGrantIds(supabase, orgId, profileId),
    getDigestHiddenGrantIds(supabase, orgId, profileId, grantIds),
    getOutcomeAdvisoryForProfile(supabase, orgId, profileId),
    fetchDigestGrantRowsByIds(supabase, grantIds, "digest"),
  ]);

  const userFunderLocations = profileFunderLocations(profile);
  const grantById = new Map(grants.map((grant) => [grant.id, grant]));
  const buildItem = (row: AssessmentDigestRow): DigestGrantItem | null => {
    const grantId = row.grant_id;
    if (!grantId || appliedGrantIds.has(grantId) || hiddenGrantIds.has(grantId)) return null;
    const grant = grantById.get(grantId);
    if (!grant || !isGrantActionableNow(grant)) return null;
    if (!grantMatchesFunderLocations(grant.funderLocations ?? undefined, userFunderLocations)) return null;
    return buildDigestGrantItem({ row, grant, profile, orgId, profileId, maxScore, outcomeAdvisory });
  };

  const currentStrongItems = strongRows
    .filter((row) => !row.notified_at)
    .map(buildItem)
    .filter((item): item is DigestGrantItem => Boolean(item));
  const currentWithinReachItems = withinReachRows
    .filter((row) => !row.notified_at)
    .map(buildItem)
    .filter((item): item is DigestGrantItem => Boolean(item));
  const currentOtherItems = otherRows
    .filter((row) => !row.notified_at)
    .map(buildItem)
    .filter((item): item is DigestGrantItem => Boolean(item));
  const previousItems = previousRows
    .map(buildItem)
    .filter((item): item is DigestGrantItem => Boolean(item));

  return {
    strong: dedupeDigestItems(currentStrongItems)
      .filter((item) => item.score >= minStrongScore)
      .sort(sortDigestByFreshScore)
      .slice(0, DIGEST_STRONG_LIMIT),
    withinReach: withinReachMax >= 50
      ? dedupeDigestItems(currentWithinReachItems)
        .filter((item) => item.score >= 50 && item.score <= withinReachMax)
        .sort(sortDigestByFreshScore)
        .slice(0, 4)
      : [],
    other: dedupeDigestItems(currentOtherItems)
      .filter((item) => item.score < 50)
      .sort(sortDigestByFreshScore)
      .slice(0, DIGEST_OTHER_LIMIT),
    previous: dedupeDigestItems(previousItems)
      .filter((item) => item.score >= minStrongScore)
      .sort(sortDigestByFreshScore)
      .slice(0, DIGEST_PREVIOUS_LIMIT),
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
    .select("organisation_id, min_score, max_score, eligible_threshold, notify_email, notify_whatsapp")
    .in("organisation_id", orgIds);
  const prefs = new Map(
    ((prefRows ?? []) as PreferenceRow[])
      .filter((pref) => Boolean(pref.organisation_id))
      .map((pref) => [pref.organisation_id as string, pref])
  );
  const minCompletionForNotifications = getEligibilityNotifyMinCompletion();

  for (const orgId of orgIds) {
    const org = orgs.get(orgId);
    const timezone = org?.preferredTimezone ?? org?.preferred_timezone ?? "UTC";
    if (respectLocalTime && !isEligibilityNotificationCatchUpTime(timezone)) continue;
    diagnostics.orgsAtLocalTime++;
    const recentWindow = notificationCooldownStart(timezone);

    const pref = prefs.get(orgId);
    const sendEmail = pref?.notify_email !== false;
    const sendWhatsApp = pref?.notify_whatsapp === true;
    if (!sendEmail && !sendWhatsApp) {
      diagnostics.skippedEmailPreference++;
      continue;
    }

    const alreadyDelivered = await orgHasNotificationSince(
      orgId,
      [...DAILY_ELIGIBILITY_NOTIFICATION_TYPES],
      recentWindow
    );
    const alreadySentWhatsApp = await orgHasNotificationChannelSince(
      orgId,
      ["grant_scan_digest", "grant_match_high"],
      "whatsapp",
      recentWindow
    );

    const profilesForOrg = byOrg.get(orgId) ?? [];
    const primaryProfile = [...profilesForOrg].sort((a, b) => {
      const completionDelta = profileCompletion(b) - profileCompletion(a);
      if (completionDelta !== 0) return completionDelta;
      return profileUpdatedAt(b) - profileUpdatedAt(a);
    })[0];
    const completionScore = profileCompletion(primaryProfile);
    if (primaryProfile?.id && completionScore < minCompletionForNotifications) {
      if (alreadyDelivered) {
        diagnostics.skippedRecent++;
        continue;
      }
      if (sendEmail) {
        await notifyOrgMembers(
          orgId,
          "profile_completion_reminder",
          {
            profileName: profileName(primaryProfile),
            profileCompletion: completionScore,
          },
          { sendEmail: true, sendWhatsApp: false }
        );
        diagnostics.dailyUpdates++;
      } else {
        diagnostics.skippedEmailPreference++;
      }
      continue;
    }

    const maxScore = pref?.max_score ?? 100;
    const minScore = suggestedScoreThreshold(pref?.eligible_threshold);
    const matchedGrantsCount = primaryProfile?.id
      ? await countStrongEligibleForOrg(supabase, orgId, primaryProfile, minScore, maxScore)
      : 0;
    const canReceiveProactiveNotifications = await organisationAllowsCapability(orgId, "proactive_notifications");

    if (!canReceiveProactiveNotifications) {
      if (alreadyDelivered) {
        diagnostics.skippedRecent++;
        continue;
      }
      await notifyOrgMembers(
        orgId,
        "eligibility_upgrade_prompt",
        {
          profileName: profileName(primaryProfile),
          matchedGrantsCount,
        },
        { sendEmail, sendWhatsApp: false }
      );
      diagnostics.upgradePrompts++;
      continue;
    }

    if (primaryProfile?.id && canReceiveProactiveNotifications) {
      const digest = await buildCurrentDigestForProfile(supabase, orgId, primaryProfile, minScore, maxScore);
      if (digest.strong.length > 0 || digest.withinReach.length > 0 || digest.other.length > 0 || digest.previous.length > 0) {
        const hasFreshStrongMatches = digest.strong.length > 0;
        const shouldSendEmail = sendEmail && (!alreadyDelivered || hasFreshStrongMatches);
        const shouldSendWhatsApp =
          sendWhatsApp &&
          !alreadySentWhatsApp &&
          hasStrongWhatsAppMatches([...digest.strong, ...digest.previous], minScore);
        if (!shouldSendEmail && !shouldSendWhatsApp) {
          diagnostics.skippedRecent++;
          continue;
        }
        await notifyOrgMembers(
          orgId,
          "grant_scan_digest",
          {
            profileName: profileName(primaryProfile),
            grants: digest.strong,
            withinReachGrants: shouldSendEmail ? digest.withinReach : [],
            otherGrants: shouldSendEmail ? digest.other : [],
            previousScanGrants: digest.previous,
            checkedGrantsCount,
            matchedGrantsCount,
          },
          { sendEmail: shouldSendEmail, sendWhatsApp: shouldSendWhatsApp }
        );
        const notifiedItems = shouldSendEmail
          ? [...digest.strong, ...digest.withinReach, ...digest.other, ...digest.previous]
          : [...digest.strong, ...digest.previous];
        if (notifiedItems.length > 0) await markDigestItemsNotified(supabase, orgId, primaryProfile.id, notifiedItems);
        diagnostics.dailyUpdates++;
        continue;
      }
    }

    if (alreadyDelivered) {
      diagnostics.skippedRecent++;
      continue;
    }

    if (sendEmail) {
      await notifyOrgMembers(
        orgId,
        "grant_scan_digest",
        {
          profileName: profileName(primaryProfile),
          grants: [],
          withinReachGrants: [],
          otherGrants: [],
          previousScanGrants: [],
          checkedGrantsCount,
          matchedGrantsCount,
        },
        { sendEmail: true, sendWhatsApp: false }
      );
      diagnostics.dailyUpdates++;
    } else {
      diagnostics.skippedEmailPreference++;
    }
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
    .filter((org) => !respectLocalTime || isEligibilityNotificationCatchUpTime(org.preferredTimezone ?? org.preferred_timezone ?? "UTC"))
    .map((org) => org.id);
  diagnostics.orgsAtLocalTime = dueOrgIds.length;

  if (dueOrgIds.length === 0) return diagnostics;

  const checkedGrantsCount = await countUsableGrants(supabase);
  diagnostics.checkedGrantsCount = checkedGrantsCount;
  const runKey = new Date().toISOString().slice(0, 13);

  for (let offset = 0; offset < dueOrgIds.length; offset += DIGEST_ENQUEUE_CHUNK_SIZE) {
    const chunk = dueOrgIds.slice(offset, offset + DIGEST_ENQUEUE_CHUNK_SIZE);
    try {
      await inngest.send(chunk.map((orgId) => ({
        id: `eligibility-digest:${orgId}:${runKey}`,
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
