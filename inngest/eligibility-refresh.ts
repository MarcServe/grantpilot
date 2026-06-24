import { inngest } from "./client";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getEligibilityDecision } from "@/lib/claude";
import { notifyOrgMembers, orgHasNotificationSince } from "@/lib/notify";
import { grantMatchesFunderLocations, inferFunderLocationsFromProfile } from "@/lib/constants";
import { createStartApplicationToken } from "@/lib/start-application-token";
import { checkRequirementsAgainstDocuments } from "@/lib/grant-requirements";
import type { DigestGrantItem } from "@/lib/notify";
import type { RequiredAttachment } from "@/lib/grant-requirements";
import { getEligibilityNotifyMinCompletion } from "@/lib/eligibility-notify-config";
import { preFilterGrants } from "@/lib/heuristic-scorer";
import { rankGrantsByEmbedding, generateAndStoreProfileEmbedding } from "@/lib/embeddings";
import { isEligibilityNotificationTime } from "@/lib/timezone";
import { isGrantActionableNow, verifyGrantActionable } from "@/lib/grant-actionability";
import { getAppliedGrantIds } from "@/lib/applied-grants";
import { isOpenAIChecked } from "@/lib/grant-source-policy";
import { runWithCronLog } from "@/lib/cron-run-log";
import { getSuppressedGrantIds } from "@/lib/grant-user-state";
import { checkUsageLimit, organisationAllowsCapability, recordUsage } from "@/lib/plan-check";
import {
  buildFundingOutcomeSignals,
  deriveOutcomeLearningAdvisory,
} from "@/lib/outcome-learning";
import { finalEligibilityScore, finaliseEligibilityAssessment } from "@/lib/eligibility-final-score";
import { isOutsideDigestGrantRepeatCooldown } from "@/lib/eligibility-digest-cooldown";
import { getMatchHealthReport } from "@/lib/match-health";
import {
  DEEP_SCORE_BATCH_SIZE,
  enqueueDeepScoreCandidates,
  processEligibilityDeepScoreQueue,
} from "@/lib/eligibility-deep-score-queue";
import { fetchGrantIntelligenceForGrantIds } from "@/lib/grant-intelligence-extract";
import { matchProfileToGrantIntelligence } from "@/lib/grant-intelligence-match";
import { isVerifiedApplicationQuality } from "@/lib/grant-application-url-quality";

/**
 * 3-Layer Eligibility Pipeline
 * 
 * Layer 1 (FREE):  Heuristic pre-filter — deadline, region, sector, funding range, applicant type
 * Layer 2 (CHEAP): Embedding similarity — OpenAI text-embedding-3-small, cosine ranking
 * Layer 3 (EXPENSIVE): OpenAI — only for top 10 candidates, deep eligibility reasoning
 * 
 * + Cache: skip grants already scored within CACHE_DAYS
 */

function positiveIntFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

const LAYER3_TOP_N = positiveIntFromEnv("ELIGIBILITY_DEEP_SCORE_TOP_N", 50);
const LAYER2_TOP_N = Math.max(LAYER3_TOP_N, positiveIntFromEnv("ELIGIBILITY_EMBEDDING_TOP_N", 75));
const GRANT_FETCH_BATCH_SIZE = 1000;
const MAX_GRANTS_PER_REFRESH = 10000;
const DIGEST_SCORE_THRESHOLD = 85;
const MIN_NOTIFICATION_SCORE_FLOOR = 75;
const NOTIFY_COOLDOWN_HOURS = 20;
const CACHE_DAYS = 1;
const REFRESH_ENQUEUE_CHUNK_SIZE = positiveIntFromEnv("ELIGIBILITY_REFRESH_ENQUEUE_CHUNK_SIZE", 100);
const REFRESH_WORKER_CONCURRENCY = positiveIntFromEnv("ELIGIBILITY_REFRESH_WORKER_CONCURRENCY", 8);
const DEEP_SCORE_WORKER_CONCURRENCY = positiveIntFromEnv("ELIGIBILITY_DEEP_SCORE_WORKER_CONCURRENCY", 3);
const DIGEST_STRONG_LIMIT = positiveIntFromEnv("ELIGIBILITY_DIGEST_STRONG_LIMIT", 20);
const DIGEST_PREVIOUS_LIMIT = positiveIntFromEnv("ELIGIBILITY_DIGEST_PREVIOUS_LIMIT", 12);

function recentNotificationWindow(): Date {
  const since = new Date();
  since.setHours(since.getHours() - NOTIFY_COOLDOWN_HOURS);
  return since;
}

function scoreToDecision(score: number): "likely_eligible" | "review" | "unlikely" {
  if (score >= 70) return "likely_eligible";
  if (score >= 40) return "review";
  return "unlikely";
}

function profileToMatching(profile: Record<string, unknown>) {
  const get = (key: string) => profile[key] ?? profile[key.replace(/([A-Z])/g, "_$1").toLowerCase()];
  return {
    businessName: String(get("businessName") ?? ""),
    sector: String(get("sector") ?? ""),
    missionStatement: String(get("missionStatement") ?? ""),
    description: String(get("description") ?? ""),
    location: String(get("location") ?? ""),
    employeeCount: profile.employeeCount != null ? Number(profile.employeeCount) : (profile.employee_count != null ? Number(profile.employee_count) : null),
    annualRevenue: profile.annualRevenue != null ? Number(profile.annualRevenue) : (profile.annual_revenue != null ? Number(profile.annual_revenue) : null),
    yearEstablished: profile.yearEstablished != null ? Number(profile.yearEstablished) : (profile.year_established != null ? Number(profile.year_established) : null),
    fundingMin: Number(get("fundingMin") ?? get("funding_min") ?? 0),
    fundingMax: Number(get("fundingMax") ?? get("funding_max") ?? 0),
    fundingPurposes: Array.isArray(profile.fundingPurposes) ? profile.fundingPurposes as string[] : (Array.isArray(profile.funding_purposes) ? profile.funding_purposes as string[] : []),
    fundingDetails: profile.fundingDetails != null ? String(profile.fundingDetails) : (profile.funding_details != null ? String(profile.funding_details) : null),
    businessType: String(get("businessType") ?? get("business_type") ?? ""),
    fundingOutcomeSignals: profile.fundingOutcomeSignals != null ? String(profile.fundingOutcomeSignals) : null,
  };
}

function getProfileOrgId(p: { organisationId?: string; organisation_id?: string }): string | null {
  const orgId = p.organisationId ?? p.organisation_id;
  return orgId && String(orgId).trim() ? String(orgId) : null;
}

function getProfileCompletionScore(profile: Record<string, unknown>): number {
  const raw = profile.completionScore ?? profile.completion_score;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 0;
}

function notificationMinScore(preferenceScore: number | undefined): number {
  return Math.max(preferenceScore ?? DIGEST_SCORE_THRESHOLD, MIN_NOTIFICATION_SCORE_FLOOR);
}

function shouldNotifyForEligibility(score: number, decision?: string | null, scoringSource?: string | null): boolean {
  return isTrustedEligibilitySource(scoringSource) && decision === "likely_eligible" && score >= MIN_NOTIFICATION_SCORE_FLOOR;
}

function isTrustedEligibilitySource(scoringSource?: string | null): boolean {
  return scoringSource === "intelligence" || isOpenAIChecked(scoringSource);
}

function isOutsideNotificationCooldown(notifiedAt: string | null | undefined, cooldown: Date): boolean {
  if (!notifiedAt) return true;
  const notifiedAtTime = new Date(notifiedAt).getTime();
  return !Number.isFinite(notifiedAtTime) || notifiedAtTime < cooldown.getTime();
}

const DIGEST_HIDDEN_SAVED_GRANT_STATES = new Set(["deferred", "applied", "dismissed"]);

async function getDigestHiddenGrantIds(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  orgId: string,
  profileId: string,
  candidateGrantIds?: string[]
): Promise<Set<string>> {
  const hidden = await getSuppressedGrantIds(supabase, orgId, profileId);

  let query = supabase
    .from("SavedGrant")
    .select("grant_id, status")
    .eq("organisation_id", orgId)
    .eq("profile_id", profileId);

  if (candidateGrantIds?.length) {
    query = query.in("grant_id", uniqueGrantIds(candidateGrantIds));
  }

  const { data, error } = await query;
  if (error) {
    console.warn("[eligibility-refresh] saved grant state lookup failed", error.message);
    return hidden;
  }

  for (const row of (data ?? []) as Array<{ grant_id?: string | null; status?: string | null }>) {
    if (row.grant_id && row.status && DIGEST_HIDDEN_SAVED_GRANT_STATES.has(row.status)) {
      hidden.add(row.grant_id);
    }
  }

  return hidden;
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
    console.warn("[eligibility-refresh] failed to mark digest grants notified", error.message);
  }
}

type CachedEligibilityRow = {
  grant_id: string;
  score: number | null;
  decision: string | null;
  summary: string | null;
  notified_at: string | null;
  updated_at?: string | null;
  missing_criteria: string[] | null;
  improvement_plan: DigestGrantItem["improvementPlan"] | null;
  scoring_source: string | null;
};

type GrantRow = {
  id: string;
  name: string;
  funder: string;
  amount?: number;
  deadline?: string;
  applicationUrl?: string | null;
  directApplicationUrl?: string | null;
  applicationUrlQuality?: string | null;
  eligibility: string;
  description?: string;
  objectives?: string;
  applicantTypes?: string[];
  sectors: string[];
  regions: string[];
  funderLocations?: string[];
  required_attachments?: unknown;
  url_status?: string | null;
  createdAt?: string | null;
};

function grantCreatedTime(grant: GrantRow | undefined): number {
  if (!grant?.createdAt) return 0;
  const time = new Date(grant.createdAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

function digestScoredTime(item: DigestGrantItem): number {
  if (!item.scoredAt) return 0;
  const time = new Date(item.scoredAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

function sortDigestByFreshScore(
  grantsById: Map<string, GrantRow>,
  a: DigestGrantItem,
  b: DigestGrantItem
): number {
  const scoredDelta = digestScoredTime(b) - digestScoredTime(a);
  if (scoredDelta !== 0) return scoredDelta;
  if (b.score !== a.score) return b.score - a.score;
  return grantCreatedTime(grantsById.get(b.grantId)) - grantCreatedTime(grantsById.get(a.grantId));
}

function hasVerifiedApplicationStart(grant: GrantRow): boolean {
  return isVerifiedApplicationQuality(grant.applicationUrlQuality) && Boolean(grant.directApplicationUrl ?? grant.applicationUrl);
}

function uniqueGrantIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const id of ids) {
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  return unique;
}

type EligibilityRefreshEnqueueResult = {
  orgsChecked: number;
  orgsEligible: number;
  enqueued: number;
  failed: number;
  source: string;
  dueOnly: boolean;
  notificationsEnabled: boolean;
  errors: string[];
};

async function enqueueEligibilityRefreshForOrgIds(
  orgIds: string[],
  source: string,
  sendNotifications = true
): Promise<Omit<EligibilityRefreshEnqueueResult, "orgsChecked" | "orgsEligible" | "dueOnly">> {
  const uniqueOrgIds = uniqueGrantIds(orgIds);
  let enqueued = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let offset = 0; offset < uniqueOrgIds.length; offset += REFRESH_ENQUEUE_CHUNK_SIZE) {
    const chunk = uniqueOrgIds.slice(offset, offset + REFRESH_ENQUEUE_CHUNK_SIZE);
    const dateKey = new Date().toISOString().slice(0, 10);
    const useDailyIdempotency = /overnight_precompute|scheduled\.local_830|vercel\.cron/i.test(source);
    try {
      await inngest.send(chunk.map((orgId) => ({
        id: useDailyIdempotency ? `eligibility-refresh:${orgId}:${dateKey}` : undefined,
        name: "eligibility/refresh.requested",
        data: { orgId, source, sendNotifications },
      })));
      enqueued += chunk.length;
    } catch (error) {
      failed += chunk.length;
      errors.push(`orgs ${offset + 1}-${offset + chunk.length}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    source,
    notificationsEnabled: sendNotifications,
    enqueued,
    failed,
    errors: errors.slice(0, 10),
  };
}

export async function enqueueEligibilityRefreshes(options: {
  source: string;
  dueOnly?: boolean;
  sendNotifications?: boolean;
}): Promise<EligibilityRefreshEnqueueResult> {
  const supabase = getSupabaseAdmin();
  const { data: orgsData, error } = await supabase
    .from("Organisation")
    .select("id, preferredTimezone");

  if (error) throw error;

  const allOrgs = (orgsData ?? []) as { id: string; preferredTimezone?: string | null }[];
  const dueOnly = options.dueOnly !== false;
  const sendNotifications = options.sendNotifications !== false;
  const eligible = dueOnly
    ? allOrgs.filter((org) => isEligibilityNotificationTime(org.preferredTimezone ?? "UTC"))
    : allOrgs;
  const enqueue = await enqueueEligibilityRefreshForOrgIds(
    eligible.map((org) => org.id),
    options.source,
    sendNotifications
  );

  return {
    orgsChecked: allOrgs.length,
    orgsEligible: eligible.length,
    dueOnly,
    ...enqueue,
  };
}

async function fetchCurrentGrants(
  supabase: ReturnType<typeof getSupabaseAdmin>
): Promise<GrantRow[]> {
  const rows: GrantRow[] = [];

  for (let offset = 0; offset < MAX_GRANTS_PER_REFRESH; offset += GRANT_FETCH_BATCH_SIZE) {
    const { data, error } = await supabase
      .from("Grant")
      .select("id, name, funder, amount, deadline, applicationUrl, directApplicationUrl, applicationUrlQuality, eligibility, description, objectives, applicantTypes, sectors, regions, funderLocations, required_attachments, url_status, createdAt")
      .order("createdAt", { ascending: false })
      .range(offset, offset + GRANT_FETCH_BATCH_SIZE - 1);

    if (error) throw error;
    const batch = (data ?? []) as GrantRow[];
    rows.push(...batch);
    if (batch.length < GRANT_FETCH_BATCH_SIZE) break;
  }

  return rows.filter((grant) => isGrantActionableNow(grant));
}

export async function runEligibilityRefreshJob(options?: {
  orgIdsFilter?: Set<string>;
  bypassCache?: boolean;
  refreshReason?: string;
  sendNotifications?: boolean;
}): Promise<{
  totalGrants: number;
  orgsWithProfile: number;
  profilesProcessed: number;
  notified: number;
  refreshed: number;
  layer1Filtered: number;
  layer2Ranked: number;
  layer3Scored: number;
  cacheHits: number;
  dailyUpdates: number;
  upgradePrompts: number;
  deepScoreQueued: number;
}> {
    const orgIdsFilter = options?.orgIdsFilter;
    const bypassCache = options?.bypassCache === true;
    const sendNotifications = options?.sendNotifications !== false;
    const supabase = getSupabaseAdmin();
    const allGrants = await fetchCurrentGrants(supabase);
    const diagnostics = {
      totalGrants: allGrants.length,
      orgsWithProfile: 0,
      profilesProcessed: 0,
      notified: 0,
      refreshed: 0,
      layer1Filtered: 0,
      layer2Ranked: 0,
      layer3Scored: 0,
      cacheHits: 0,
      dailyUpdates: 0,
      upgradePrompts: 0,
      deepScoreQueued: 0,
    };
    if (allGrants.length === 0) {
      console.info("[eligibility-refresh] No grants in DB", diagnostics);
      return { ...diagnostics };
    }

    const { data: profilesData } = await supabase.from("BusinessProfile").select("*");
    const profiles = profilesData ?? [];

    const minCompletionForNotifications = getEligibilityNotifyMinCompletion();
    let profilesWithOrg = profiles.filter((p) => getProfileOrgId(p as { organisationId?: string; organisation_id?: string }) != null);

    if (orgIdsFilter) {
      profilesWithOrg = profilesWithOrg.filter((p) =>
        orgIdsFilter.has(getProfileOrgId(p as { organisationId?: string; organisation_id?: string })!)
      );
      console.info(`[eligibility-refresh] Timezone filter: processing ${profilesWithOrg.length} profiles for ${orgIdsFilter.size} orgs at 8:30 AM local`);
    }

    const uniqueOrgs = new Set(
      profilesWithOrg.map((p) => getProfileOrgId(p as { organisationId?: string; organisation_id?: string })!)
    );
    diagnostics.orgsWithProfile = uniqueOrgs.size;
    diagnostics.profilesProcessed = profilesWithOrg.length;

    if (profilesWithOrg.length === 0) {
      console.info("[eligibility-refresh] No BusinessProfile rows linked to an organisation", diagnostics);
      return { ...diagnostics };
    }

    let notifiedCount = 0;

    const grantsList = allGrants as GrantRow[];

    const cacheThreshold = new Date();
    cacheThreshold.setDate(cacheThreshold.getDate() - CACHE_DAYS);

    for (const profile of profilesWithOrg) {
      const orgId = getProfileOrgId(profile as { organisationId?: string; organisation_id?: string })!;
      const profileId = (profile as { id?: string }).id ?? "unknown";
      try {
        const completionScore = getProfileCompletionScore(profile as Record<string, unknown>);
        const profileName = (profile as { businessName?: string }).businessName ?? profileId;
        console.info(`[eligibility-refresh] Processing org=${orgId} profile=${profileId} "${profileName}" completion=${completionScore}% reason=${options?.refreshReason ?? "scheduled"} bypassCache=${bypassCache}`);

        const { data: prefs } = await supabase
          .from("EligibilityNotificationPreference")
          .select("min_score, max_score, eligible_threshold, notify_email, notify_in_app, notify_whatsapp")
          .eq("organisation_id", orgId)
          .maybeSingle();
        const minScore = notificationMinScore((prefs as { min_score?: number } | null)?.min_score);
        const maxScore = (prefs as { max_score?: number } | null)?.max_score ?? 100;
        const eligibleThreshold = notificationMinScore((prefs as { eligible_threshold?: number } | null)?.eligible_threshold);
        const suggestedThreshold = Math.max(DIGEST_SCORE_THRESHOLD, eligibleThreshold);
        const sendWhatsApp = (prefs as { notify_whatsapp?: boolean } | null)?.notify_whatsapp ?? true;
        const sendNotifyEmail = (prefs as { notify_email?: boolean } | null)?.notify_email !== false;
        const canReceiveProactiveNotifications = await organisationAllowsCapability(orgId, "proactive_notifications");
        const recentWindow = recentNotificationWindow();
        let sendCurrentDigestIfAvailable: (() => Promise<boolean>) | null = null;

        const sendEligibilityStatusEmail = async (checkedGrantsCount: number, digestCandidateCount = 0) => {
          if (!sendNotifications) return;
          if (!sendNotifyEmail) return;
          const strongEligibleCount = Math.max(0, Math.round(digestCandidateCount));

          if (!canReceiveProactiveNotifications) {
            const alreadyPrompted = await orgHasNotificationSince(
              orgId,
              ["eligibility_upgrade_prompt"],
              recentWindow
            );
            if (alreadyPrompted) return;
            await notifyOrgMembers(orgId, "eligibility_upgrade_prompt", {
              profileName,
              matchedGrantsCount: strongEligibleCount,
            }, {
              sendEmail: true,
              sendWhatsApp: false,
            });
            diagnostics.upgradePrompts++;
            return;
          }

          const alreadyUpdated = await orgHasNotificationSince(
            orgId,
            ["daily_grant_update", "grant_scan_digest", "grant_match_high", "eligibility_upgrade_prompt", "business_dna_match_health"],
            recentWindow
          );
          if (alreadyUpdated) return;

          if (sendCurrentDigestIfAvailable && await sendCurrentDigestIfAvailable()) {
            return;
          }

          await notifyOrgMembers(orgId, "daily_grant_update", {
            profileName,
            checkedGrantsCount,
            matchedGrantsCount: strongEligibleCount,
          }, {
            sendEmail: true,
            sendWhatsApp: false,
          });
          diagnostics.dailyUpdates++;
        };

        const sendMatchHealthPrompt = async () => {
          if (!sendNotifications) return false;
          if (!sendNotifyEmail) return false;
          if (!canReceiveProactiveNotifications) return false;
          if (completionScore < minCompletionForNotifications) return false;
          const promptCooldown = new Date();
          promptCooldown.setDate(promptCooldown.getDate() - 3);
          const alreadyPrompted = await orgHasNotificationSince(
            orgId,
            ["business_dna_match_health"],
            promptCooldown
          );
          if (alreadyPrompted) return false;

          const report = await getMatchHealthReport({
            supabase,
            orgId,
            profile: profile as Record<string, unknown> & { id: string },
          });
          if (!report.shouldPrompt) return false;

          await notifyOrgMembers(orgId, "business_dna_match_health", {
            profileName,
            withinReachCount: report.currentWithinReach,
            matchedGrantsCount: report.currentWithinReach,
            daysWithoutHighMatch: report.daysSinceHighMatch ?? 3,
            matchHealthBlockers: report.topBlockers.map((blocker) => blocker.label).slice(0, 5),
            matchHealthActions: report.recommendedActions.slice(0, 5),
          }, {
            sendEmail: true,
            sendWhatsApp: false,
          });
          diagnostics.dailyUpdates++;
          return true;
        };

        const appliedGrantIds = await getAppliedGrantIds(supabase, orgId, profileId);
        const hiddenGrantIds = await getDigestHiddenGrantIds(supabase, orgId, profileId);
        const actionableGrants = grantsList.filter(
          (g) => !appliedGrantIds.has(g.id) && !hiddenGrantIds.has(g.id)
        );
        console.info(
          `[eligibility-refresh]   Excluding ${appliedGrantIds.size} grants with existing applications and ${hiddenGrantIds.size} hidden/deferred/applied/dismissed grants`
        );

        // ── Funder location pre-filter (existing) ──
        const userFunderLocations = inferFunderLocationsFromProfile(profile as {
          funderLocations?: string[] | null;
          location?: string | null;
          country?: string | null;
          region?: string | null;
        });
        const locationFiltered = actionableGrants.filter((g) => grantMatchesFunderLocations(g.funderLocations, userFunderLocations));
        console.info(`[eligibility-refresh]   ${locationFiltered.length} grants match funder locations (of ${actionableGrants.length} actionable, ${grantsList.length} total)`);

        if (locationFiltered.length === 0) {
          console.info(`[eligibility-refresh]   Skipping: no grants match user funderLocations`);
          if (!(await sendMatchHealthPrompt())) await sendEligibilityStatusEmail(0);
          continue;
        }

        // ── LAYER 1: Heuristic pre-filter (FREE) ──
        const heuristicProfile = {
          location: String((profile as Record<string, unknown>).location ?? ""),
          sector: String((profile as Record<string, unknown>).sector ?? ""),
          fundingMin: Number((profile as Record<string, unknown>).fundingMin ?? (profile as Record<string, unknown>).funding_min ?? 0),
          fundingMax: Number((profile as Record<string, unknown>).fundingMax ?? (profile as Record<string, unknown>).funding_max ?? 0),
          fundingPurposes: Array.isArray((profile as Record<string, unknown>).fundingPurposes) ? (profile as Record<string, unknown>).fundingPurposes as string[] : [],
          employeeCount: (profile as Record<string, unknown>).employeeCount != null ? Number((profile as Record<string, unknown>).employeeCount) : null,
          annualRevenue: (profile as Record<string, unknown>).annualRevenue != null ? Number((profile as Record<string, unknown>).annualRevenue) : null,
          yearEstablished: (profile as Record<string, unknown>).yearEstablished != null ? Number((profile as Record<string, unknown>).yearEstablished) : ((profile as Record<string, unknown>).year_established != null ? Number((profile as Record<string, unknown>).year_established) : null),
          businessType: String((profile as Record<string, unknown>).businessType ?? (profile as Record<string, unknown>).business_type ?? "") || null,
        };

        const heuristicResults = preFilterGrants(
          heuristicProfile,
          locationFiltered.map((g) => ({
            id: g.id,
            amount: g.amount,
            deadline: g.deadline,
            eligibility: g.eligibility,
            sectors: g.sectors ?? [],
            regions: g.regions ?? [],
            applicantTypes: g.applicantTypes,
            description: g.description,
            objectives: g.objectives,
          }))
        );
        diagnostics.layer1Filtered += heuristicResults.length;
        console.info(`[eligibility-refresh]   LAYER 1 (heuristic): ${locationFiltered.length} → ${heuristicResults.length} passed`);

        if (heuristicResults.length === 0) {
          console.info(`[eligibility-refresh]   No grants passed heuristic filter`);
          if (!(await sendMatchHealthPrompt())) await sendEligibilityStatusEmail(locationFiltered.length);
          continue;
        }

        // ── CACHE CHECK: skip grants already scored recently ──
        const candidateIds = heuristicResults.map((r) => r.grantId);
        const { data: cachedRows } = bypassCache
          ? { data: [] }
          : await supabase
            .from("EligibilityAssessment")
            .select("grant_id, updated_at, score, decision, summary, notified_at, missing_criteria, improvement_plan, scoring_source")
            .eq("organisation_id", orgId)
            .eq("profile_id", profileId)
            .in("grant_id", candidateIds)
            .gte("updated_at", cacheThreshold.toISOString());

        const cachedGrantIds = new Set(
          (cachedRows ?? [])
            .filter((r: { grant_id: string; scoring_source?: string | null }) => isTrustedEligibilitySource(r.scoring_source))
            .map((r: { grant_id: string }) => r.grant_id)
        );
        const uncachedIds = candidateIds.filter((id) => !cachedGrantIds.has(id));
        diagnostics.cacheHits += cachedGrantIds.size;
        console.info(`[eligibility-refresh]   CACHE: ${cachedGrantIds.size} already scored (within ${CACHE_DAYS}d), ${uncachedIds.length} need scoring`);

        // ── LAYER 2: Embedding similarity (CHEAP) ──
        let layer2Candidates: string[];
        if (uncachedIds.length <= LAYER3_TOP_N) {
          layer2Candidates = uncachedIds;
        } else {
          const grantsById = new Map(locationFiltered.map((grant) => [grant.id, grant]));
          const newestHighHeuristicIds = heuristicResults
            .filter((result) => uncachedIds.includes(result.grantId))
            .sort((a, b) => {
              if (b.score !== a.score) return b.score - a.score;
              return grantCreatedTime(grantsById.get(b.grantId)) - grantCreatedTime(grantsById.get(a.grantId));
            })
            .map((result) => result.grantId);
          try {
            await generateAndStoreProfileEmbedding(profileId);
            const embeddingRanked = await rankGrantsByEmbedding(profileId, uncachedIds, LAYER2_TOP_N);
            layer2Candidates = uniqueGrantIds([
              ...embeddingRanked.map((r) => r.grantId),
              ...newestHighHeuristicIds,
            ]).slice(0, LAYER2_TOP_N);
            diagnostics.layer2Ranked += embeddingRanked.length;
            if (embeddingRanked.length > 0) {
              const topSims = embeddingRanked.slice(0, 5).map((r) => `${r.grantId.slice(0, 12)}:${r.similarity.toFixed(3)}`);
              console.info(`[eligibility-refresh]   LAYER 2 (embeddings): ${uncachedIds.length} → ${embeddingRanked.length}, top: ${topSims.join(", ")}`);
            } else {
              console.info(`[eligibility-refresh]   LAYER 2 (embeddings): no grant embeddings available; using newest/high-heuristic fallback`);
            }
          } catch (embErr) {
            console.warn(`[eligibility-refresh]   LAYER 2 failed (falling back to heuristic order): ${embErr instanceof Error ? embErr.message : embErr}`);
            layer2Candidates = newestHighHeuristicIds.slice(0, LAYER2_TOP_N);
            diagnostics.layer2Ranked += layer2Candidates.length;
          }
        }

        // ── LAYER 3: OpenAI deep scoring (EXPENSIVE — only top N) ──
        const layer3Ids = layer2Candidates.slice(0, LAYER3_TOP_N);
        const layer3IdSet = new Set(layer3Ids);
        const scoredByOpenAIIds = new Set<string>();
        const intelligenceScoredIds = new Set<string>();
        const intelligenceReviewCandidates: Array<{
          grant: GrantRow;
          heuristicScore: number;
          reason: string;
          source: string;
        }> = [];
        console.info(`[eligibility-refresh]   LAYER 3 (OpenAI): scoring ${layer3Ids.length} grants`);

        const cooldown = new Date();
        cooldown.setHours(cooldown.getHours() - NOTIFY_COOLDOWN_HOURS);
        const digestGrants: DigestGrantItem[] = [];

        const { data: profileDocsData } = await supabase.from("Document").select("name, type, category").eq("profileId", profileId);
        const profileDocsAlt = !profileDocsData?.length
          ? await supabase.from("Document").select("name, type, category").eq("profile_id", profileId)
          : { data: profileDocsData };
        const profileDocuments = (profileDocsAlt.data ?? []).map((d: { name: string; type?: string; category?: string }) => ({
          name: d.name,
          type: d.type ?? "",
          category: d.category ?? null,
        }));
        const { data: outcomeRows } = await supabase
          .from("ApplicationOutcome")
          .select("outcome, awardedAmount, funderFeedback, learningNotes, Grant(name, funder)")
          .eq("organisationId", orgId)
          .eq("profileId", profileId)
          .order("reportedAt", { ascending: false })
          .limit(8);
        const fundingOutcomeSignals = buildFundingOutcomeSignals(outcomeRows ?? []);
        const outcomeAdvisory = deriveOutcomeLearningAdvisory(outcomeRows ?? []);
        const grantsByIdForDigest = new Map(locationFiltered.map((grant) => [grant.id, grant]));

        // ── CENTRAL INTELLIGENCE: reusable grant facts scored against this profile ──
        // Full OpenAI profile/grant assessments remain authoritative; this fills the
        // middle ground between cheap heuristics and expensive per-profile scoring.
        try {
          const existingTrustedOpenAi = layer2Candidates.length === 0
            ? { data: [] }
            : await supabase
              .from("EligibilityAssessment")
              .select("grant_id")
              .eq("organisation_id", orgId)
              .eq("profile_id", profileId)
              .eq("scoring_source", "openai")
              .in("grant_id", layer2Candidates);
          const existingOpenAiIds = new Set(
            ((existingTrustedOpenAi.data ?? []) as Array<{ grant_id?: string | null }>)
              .map((row) => row.grant_id)
              .filter((id): id is string => Boolean(id))
          );
          const intelligenceByGrant = await fetchGrantIntelligenceForGrantIds(supabase, layer2Candidates);

          for (const grantId of layer2Candidates) {
            if (cachedGrantIds.has(grantId) || existingOpenAiIds.has(grantId)) continue;
            const intelligence = intelligenceByGrant.get(grantId);
            const grant = grantsByIdForDigest.get(grantId);
            if (!intelligence || !grant) continue;

            const intelligenceResult = matchProfileToGrantIntelligence(profile as Record<string, unknown>, grant, intelligence);
            const adjustedResult = finaliseEligibilityAssessment(
              profile as Record<string, unknown>,
              grant,
              intelligenceResult,
              outcomeAdvisory
            );
            const score = finalEligibilityScore(adjustedResult);
            const { error: intelligenceUpsertErr } = await supabase.from("EligibilityAssessment").upsert(
              {
                organisation_id: orgId,
                profile_id: profileId,
                grant_id: grant.id,
                score,
                decision: adjustedResult.decision,
                summary: adjustedResult.summary ?? adjustedResult.reason ?? intelligenceResult.summary,
                reasons: adjustedResult.reasons ?? intelligenceResult.reasons ?? [],
                alignment: adjustedResult.alignment ?? intelligenceResult.alignment ?? null,
                improvement_plan: adjustedResult.improvementPlan ?? intelligenceResult.improvementPlan ?? null,
                met_criteria: adjustedResult.met ?? intelligenceResult.met ?? [],
                missing_criteria: adjustedResult.missing ?? intelligenceResult.missing ?? [],
                scoring_source: "intelligence",
                updated_at: new Date().toISOString(),
              },
              { onConflict: "organisation_id,profile_id,grant_id" }
            );
            if (intelligenceUpsertErr) {
              console.error("[eligibility-refresh] intelligence upsert", grant.id, intelligenceUpsertErr);
              continue;
            }

            intelligenceScoredIds.add(grant.id);
            if (intelligenceResult.requiresOpenAiReview && score >= 70 && !layer3IdSet.has(grant.id)) {
              intelligenceReviewCandidates.push({
                grant,
                heuristicScore: score,
                reason: adjustedResult.summary ?? intelligenceResult.summary ?? intelligenceResult.reason ?? "Grant intelligence match",
                source: "grant_intelligence",
              });
            }
          }

          if (intelligenceScoredIds.size > 0) {
            console.info(`[eligibility-refresh]   GRANT INTELLIGENCE: scored ${intelligenceScoredIds.size} reusable grant-fact matches`);
          }
        } catch (error) {
          console.warn(
            "[eligibility-refresh]   grant intelligence scoring skipped:",
            error instanceof Error ? error.message : String(error)
          );
        }

        const buildDigestItem = async (
          assessment: CachedEligibilityRow,
          range?: { minScore?: number; maxScore?: number },
          options?: { includeRecentlyNotified?: boolean }
        ): Promise<DigestGrantItem | null> => {
          if (appliedGrantIds.has(assessment.grant_id) || hiddenGrantIds.has(assessment.grant_id)) return null;
          if (!options?.includeRecentlyNotified && !isOutsideDigestGrantRepeatCooldown(assessment.notified_at)) return null;
          const grant = grantsByIdForDigest.get(assessment.grant_id);
          if (!grant) return null;
          const actionability = await verifyGrantActionable(grant, { supabase });
          if (!actionability.usable) {
            console.info(
              `[eligibility-refresh]   Skipping stale grant ${grant.id}: ${actionability.message ?? actionability.reason ?? "not actionable"}`
            );
            return null;
          }
          if (!hasVerifiedApplicationStart(grant)) {
            console.info(
              `[eligibility-refresh]   Skipping unverified application link ${grant.id}: ${grant.applicationUrlQuality ?? "unknown"}`
            );
            return null;
          }
          const finalResult = finaliseEligibilityAssessment(
            profile as Record<string, unknown>,
            grant,
            assessment,
            outcomeAdvisory
          );
          const score = finalEligibilityScore(finalResult);
          if (range?.minScore != null && score < range.minScore) return null;
          if (range?.maxScore != null && score > range.maxScore) return null;

          const startApplicationToken = createStartApplicationToken({
            grantId: grant.id,
            profileId: profileId,
            organisationId: orgId,
          });
          const rawRequired = (grant as { required_attachments?: unknown }).required_attachments;
          const required = (Array.isArray(rawRequired) ? rawRequired : []) as RequiredAttachment[];
          const { missing } = checkRequirementsAgainstDocuments(required, profileDocuments);

          return {
            grantId: grant.id,
            grantName: grant.name,
            score,
            scoredAt: assessment.updated_at ?? null,
            grantAddedAt: grant.createdAt ?? null,
            summary:
              finalResult.summary ??
              finalResult.reason ??
              assessment.summary ??
              "Full company-DNA assessment found a strong match between your profile and this grant.",
            startApplicationToken,
            missingDocuments: missing.length > 0 ? missing.map((r) => r.label) : undefined,
            improvementPlan: finalResult.improvementPlan ?? assessment.improvement_plan ?? undefined,
            missingCriteria: finalResult.missing ?? assessment.missing_criteria ?? undefined,
          };
        };

        const buildCurrentStrongDigest = async (limit = DIGEST_STRONG_LIMIT): Promise<DigestGrantItem[]> => {
          const { data: currentRows, error: currentErr } = await supabase
            .from("EligibilityAssessment")
            .select("grant_id, updated_at, score, decision, summary, notified_at, missing_criteria, improvement_plan, scoring_source")
            .eq("organisation_id", orgId)
            .eq("profile_id", profileId)
            .eq("decision", "likely_eligible")
            .in("scoring_source", ["openai", "intelligence"])
            .gte("score", suggestedThreshold)
            .lte("score", maxScore)
            .order("updated_at", { ascending: false })
            .limit(30);

          if (currentErr) {
            console.error("[eligibility-refresh] current strong digest query", currentErr);
            return [];
          }

          const items: DigestGrantItem[] = [];
          for (const row of (currentRows ?? []) as CachedEligibilityRow[]) {
            const item = await buildDigestItem(row, { minScore: suggestedThreshold, maxScore });
            if (item) items.push(item);
          }

          return items
            .sort((a, b) => sortDigestByFreshScore(grantsByIdForDigest, a, b))
            .slice(0, limit);
        };

        const buildCurrentWithinReachDigest = async (limit = 4): Promise<DigestGrantItem[]> => {
          const withinReachMax = Math.min(maxScore, suggestedThreshold - 1);
          if (withinReachMax < 50) return [];

          const { data: currentRows, error: currentErr } = await supabase
            .from("EligibilityAssessment")
            .select("grant_id, updated_at, score, decision, summary, notified_at, missing_criteria, improvement_plan, scoring_source")
            .eq("organisation_id", orgId)
            .eq("profile_id", profileId)
            .in("scoring_source", ["openai", "intelligence"])
            .gte("score", 50)
            .lte("score", withinReachMax)
            .order("updated_at", { ascending: false })
            .limit(40);

          if (currentErr) {
            console.error("[eligibility-refresh] current within-reach digest query", currentErr);
            return [];
          }

          const items: DigestGrantItem[] = [];
          for (const row of (currentRows ?? []) as CachedEligibilityRow[]) {
            const item = await buildDigestItem(row, { minScore: 50, maxScore: withinReachMax });
            if (item) items.push(item);
          }

          return items
            .sort((a, b) => sortDigestByFreshScore(grantsByIdForDigest, a, b))
            .slice(0, limit);
        };
        const buildPreviousScanDigest = async (limit = DIGEST_PREVIOUS_LIMIT): Promise<DigestGrantItem[]> => {
          const { data: recentRows, error: recentErr } = await supabase
            .from("EligibilityAssessment")
            .select("grant_id, updated_at, score, decision, summary, notified_at, missing_criteria, improvement_plan, scoring_source")
            .eq("organisation_id", orgId)
            .eq("profile_id", profileId)
            .in("scoring_source", ["openai", "intelligence"])
            .gte("score", 50)
            .lte("score", maxScore)
            .not("notified_at", "is", null)
            .order("notified_at", { ascending: false })
            .limit(60);

          if (recentErr) {
            console.error("[eligibility-refresh] previous scan digest query", recentErr);
            return [];
          }

          const items: DigestGrantItem[] = [];
          for (const row of (recentRows ?? []) as CachedEligibilityRow[]) {
            if (isOutsideDigestGrantRepeatCooldown(row.notified_at)) continue;
            const item = await buildDigestItem(row, { minScore: 50, maxScore }, { includeRecentlyNotified: true });
            if (item) items.push(item);
          }

          return items
            .sort((a, b) => sortDigestByFreshScore(grantsByIdForDigest, a, b))
            .slice(0, limit);
        };
        let currentStrongDigestCache: DigestGrantItem[] | null = null;
        const getCurrentStrongDigest = async () => {
          if (!currentStrongDigestCache) currentStrongDigestCache = await buildCurrentStrongDigest();
          return currentStrongDigestCache;
        };
        const hasStrongWhatsAppMatches = (items: DigestGrantItem[]) =>
          items.some((item) => item.score >= suggestedThreshold);
        sendCurrentDigestIfAvailable = async () => {
          const currentStrongDigest = await getCurrentStrongDigest();
          const currentWithinReachDigest = await buildCurrentWithinReachDigest();
          const previousScanGrants = await buildPreviousScanDigest();
          if (currentStrongDigest.length === 0 && currentWithinReachDigest.length === 0 && previousScanGrants.length === 0) return false;

          console.info(
            `[eligibility-refresh]   SENDING fallback current-match digest for ${currentStrongDigest.length} strong, ${currentWithinReachDigest.length} within-reach, and ${previousScanGrants.length} previous grants to org ${orgId}`
          );
          await notifyOrgMembers(orgId, "grant_scan_digest", {
            grants: currentStrongDigest,
            withinReachGrants: currentWithinReachDigest,
            previousScanGrants,
            profileName,
          }, {
            sendEmail: true,
            sendWhatsApp: sendWhatsApp && hasStrongWhatsAppMatches([...currentStrongDigest, ...previousScanGrants]),
          });
          diagnostics.dailyUpdates++;
          notifiedCount += currentStrongDigest.length;
          await markDigestItemsNotified(supabase, orgId, profileId, [
            ...currentStrongDigest,
            ...currentWithinReachDigest,
          ]);
          return true;
        };

        for (const cached of (cachedRows ?? []) as CachedEligibilityRow[]) {
          const score = Number(cached.score ?? 0);
          if (
            !Number.isFinite(score) ||
            score < suggestedThreshold ||
            score > maxScore ||
            !shouldNotifyForEligibility(score, cached.decision, cached.scoring_source) ||
            !isOutsideNotificationCooldown(cached.notified_at, cooldown)
          ) {
            continue;
          }

          const digestItem = await buildDigestItem(cached, { minScore: suggestedThreshold, maxScore });
          if (digestItem) digestGrants.push(digestItem);
        }

        for (const grantId of layer3Ids) {
          const grant = locationFiltered.find((g) => g.id === grantId);
          if (!grant) continue;

          try {
            const usage = await checkUsageLimit(orgId, "match");
            if (!usage.allowed) {
              console.info(
                `[eligibility-refresh]   Match quota reached for org=${orgId}; keeping remaining grants as preliminary heuristic scores`
              );
              break;
            }

            const result = await getEligibilityDecision(
              profileToMatching({
                ...(profile as Record<string, unknown>),
              }),
              {
                id: grant.id,
                name: grant.name,
                funder: grant.funder,
                amount: grant.amount ?? null,
                eligibility: grant.eligibility,
                description: grant.description ?? null,
                objectives: grant.objectives ?? null,
                applicantTypes: grant.applicantTypes ?? [],
                sectors: grant.sectors ?? [],
                regions: grant.regions ?? [],
              }
            );
            const adjustedResult = finaliseEligibilityAssessment(
              profile as Record<string, unknown>,
              grant,
              result,
              outcomeAdvisory
            );
            diagnostics.layer3Scored++;

            const score = finalEligibilityScore(adjustedResult);
            const summary = adjustedResult.summary ?? adjustedResult.reason ?? undefined;

            const { error: upsertErr } = await supabase.from("EligibilityAssessment").upsert(
              {
                organisation_id: orgId,
                profile_id: profileId,
                grant_id: grant.id,
                score,
                decision: adjustedResult.decision,
                summary,
                reasons: adjustedResult.reasons ?? [],
                alignment: adjustedResult.alignment ?? null,
                improvement_plan: adjustedResult.improvementPlan ?? null,
                met_criteria: adjustedResult.met ?? [],
                missing_criteria: adjustedResult.missing ?? [],
                scoring_source: "openai",
                updated_at: new Date().toISOString(),
              },
              { onConflict: "organisation_id,profile_id,grant_id" }
            );
            if (upsertErr) console.error("[eligibility-refresh] upsert", upsertErr);
            if (!upsertErr) {
              scoredByOpenAIIds.add(grant.id);
              await recordUsage(orgId, "match").catch((usageErr) =>
                console.error("[eligibility-refresh] record usage", usageErr)
              );
            }

            const inRange =
              score >= suggestedThreshold &&
              score <= maxScore &&
              shouldNotifyForEligibility(score, adjustedResult.decision, "openai");

            if (inRange) {
              const { data: existing } = await supabase
                .from("EligibilityAssessment")
                .select("notified_at")
                .eq("organisation_id", orgId)
                .eq("profile_id", profileId)
                .eq("grant_id", grant.id)
                .single();

              const notifiedAt = (existing as { notified_at: string | null } | null)?.notified_at;
              const includeInDigest = isOutsideNotificationCooldown(notifiedAt, cooldown);
              if (includeInDigest) {
                const digestItem = await buildDigestItem(
                  {
                    grant_id: grant.id,
                    score,
                    summary:
                      summary ??
                      "Full company-DNA assessment found a strong match between your profile and this grant.",
                    decision: adjustedResult.decision,
                    notified_at: notifiedAt ?? null,
                    missing_criteria: adjustedResult.missing ?? [],
                    improvement_plan: adjustedResult.improvementPlan ?? null,
                    scoring_source: "openai",
                  },
                  { minScore: suggestedThreshold, maxScore }
                );
                if (digestItem) digestGrants.push(digestItem);
              }
            }
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            console.error(`[eligibility-refresh]   grant ${grantId} for org ${orgId}: ${errMsg.slice(0, 200)}`);
            if (/credit balance|quota|billing/i.test(errMsg)) {
              console.error(`[eligibility-refresh]   OpenAI billing or quota issue — stopping scoring`);
              break;
            }
          }
        }

        // Persist low-confidence heuristic scores for grants not sent to OpenAI.
        // These keep the list ordered without pretending a full AI eligibility assessment has run.
        const unscoredHeuristic = heuristicResults.filter(
          (r) => !scoredByOpenAIIds.has(r.grantId) && !cachedGrantIds.has(r.grantId) && !intelligenceScoredIds.has(r.grantId)
        );
        for (const h of unscoredHeuristic) {
          const { error: batchErr } = await supabase.from("EligibilityAssessment").upsert(
            {
              organisation_id: orgId,
              profile_id: profileId,
              grant_id: h.grantId,
              score: Math.min(h.score, 69),
              decision: scoreToDecision(Math.min(h.score, 69)),
              summary: `Preliminary fit only: ${h.reasons.join(", ")}. Open the grant and run a fresh GrantsCopilot check for company-DNA reasoning.`,
              reasons: h.reasons,
              scoring_source: "heuristic",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "organisation_id,profile_id,grant_id" }
          );
          if (batchErr) console.error("[eligibility-refresh] heuristic upsert", h.grantId, batchErr);
        }
        const queuedCandidates = [
          ...intelligenceReviewCandidates,
          ...unscoredHeuristic
          .map((h) => {
            const grant = grantsByIdForDigest.get(h.grantId);
            if (!grant) return null;
            return {
              grant,
              heuristicScore: h.score,
              reason: h.reasons.join(", "),
              source: options?.refreshReason ?? "eligibility_refresh",
            };
          })
          .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate)),
        ];
        const queueResult = await enqueueDeepScoreCandidates({
          supabase,
          organisationId: orgId,
          profileId,
          profile: profile as Record<string, unknown> & { id?: string },
          candidates: queuedCandidates,
          source: options?.refreshReason ?? "eligibility_refresh",
        });
        diagnostics.deepScoreQueued += queueResult.enqueued;
        if (queueResult.enqueued > 0) {
          await inngest.send({
            name: "eligibility/deep-score.process",
            data: {
              source: options?.refreshReason ?? "eligibility_refresh",
              limit: DEEP_SCORE_BATCH_SIZE,
            },
          }).catch((error) =>
            console.warn("[eligibility-refresh] deep-score process enqueue failed:", error instanceof Error ? error.message : String(error))
          );
        }

        // ── Notification ──
        if (!sendNotifications) {
          console.info(`[eligibility-refresh]   Notifications disabled for org=${orgId}; saved scores and queued deep scoring only`);
          continue;
        }

        console.info(`[eligibility-refresh]   Digest candidates: ${digestGrants.length} grants, completion=${completionScore}%, threshold=${minCompletionForNotifications}%, email=${sendNotifyEmail}, whatsapp=${sendWhatsApp}`);

        const strongEligibleCount =
          digestGrants.length > 0 ? digestGrants.length : (await getCurrentStrongDigest()).length;

        if (!canReceiveProactiveNotifications && sendNotifyEmail) {
          const alreadyPrompted = await orgHasNotificationSince(
            orgId,
            ["eligibility_upgrade_prompt"],
            recentWindow
          );
          if (!alreadyPrompted) {
            await notifyOrgMembers(orgId, "eligibility_upgrade_prompt", {
              profileName,
              matchedGrantsCount: strongEligibleCount,
            }, {
              sendEmail: true,
              sendWhatsApp: false,
            });
            diagnostics.upgradePrompts++;
          }
        } else if (digestGrants.length > 0 && completionScore >= minCompletionForNotifications) {
          console.info(`[eligibility-refresh]   SENDING digest notification for ${digestGrants.length} grants to org ${orgId}`);
          const withinReachGrants = await buildCurrentWithinReachDigest();
          const previousScanGrants = await buildPreviousScanDigest();
          await notifyOrgMembers(orgId, "grant_scan_digest", {
            grants: digestGrants,
            withinReachGrants,
            previousScanGrants,
            profileName,
          }, {
            sendEmail: sendNotifyEmail,
            sendWhatsApp: sendWhatsApp && hasStrongWhatsAppMatches([...digestGrants, ...previousScanGrants]),
          });
          await markDigestItemsNotified(supabase, orgId, profileId, [
            ...digestGrants,
            ...withinReachGrants,
          ]);
          notifiedCount += digestGrants.length;
        } else if (digestGrants.length > 0 && completionScore < minCompletionForNotifications) {
          console.info(`[eligibility-refresh] Skipping digest: completion ${completionScore}% < ${minCompletionForNotifications}%`);
          await sendEligibilityStatusEmail(locationFiltered.length, strongEligibleCount);
        } else if (completionScore >= minCompletionForNotifications && (sendNotifyEmail || sendWhatsApp)) {
          const alreadyUpdated = await orgHasNotificationSince(
            orgId,
            ["daily_grant_update", "grant_scan_digest", "grant_match_high", "eligibility_upgrade_prompt", "business_dna_match_health"],
            recentWindow
          );
          const currentStrongDigest = alreadyUpdated ? [] : await getCurrentStrongDigest();
          const currentWithinReachDigest = alreadyUpdated ? [] : await buildCurrentWithinReachDigest();
          const previousScanGrants = alreadyUpdated ? [] : await buildPreviousScanDigest();
          if (currentStrongDigest.length > 0 || currentWithinReachDigest.length > 0 || previousScanGrants.length > 0) {
            console.info(
              `[eligibility-refresh]   SENDING current-match digest for ${currentStrongDigest.length} strong, ${currentWithinReachDigest.length} within-reach, and ${previousScanGrants.length} previous grants to org ${orgId}`
            );
            await notifyOrgMembers(orgId, "grant_scan_digest", {
              grants: currentStrongDigest,
              withinReachGrants: currentWithinReachDigest,
              previousScanGrants,
              profileName,
            }, {
              sendEmail: sendNotifyEmail,
              sendWhatsApp: sendWhatsApp && hasStrongWhatsAppMatches([...currentStrongDigest, ...previousScanGrants]),
            });
            diagnostics.dailyUpdates++;
            notifiedCount += currentStrongDigest.length;
            await markDigestItemsNotified(supabase, orgId, profileId, [
              ...currentStrongDigest,
              ...currentWithinReachDigest,
            ]);
          } else {
            if (!(await sendMatchHealthPrompt())) await sendEligibilityStatusEmail(locationFiltered.length, strongEligibleCount);
          }
        } else if (sendNotifyEmail) {
          if (!(await sendMatchHealthPrompt())) await sendEligibilityStatusEmail(locationFiltered.length, strongEligibleCount);
        }
      } catch (err) {
        console.error(`[eligibility-refresh] org ${orgId} profile ${profileId}:`, err);
      }
    }

    diagnostics.notified = notifiedCount;
    diagnostics.refreshed = profilesWithOrg.length;
    console.info("[eligibility-refresh] Complete", diagnostics);
    return { ...diagnostics };
}

export const eligibilityRefresh = inngest.createFunction(
  { id: "eligibility-refresh", name: "Eligibility overnight precompute" },
  { cron: "0 1 * * *" },
  async () => runWithCronLog({ jobName: "Eligibility Overnight Precompute", route: "inngest/eligibility-refresh", trigger: "inngest" }, async () => {
    const result = await enqueueEligibilityRefreshes({
      source: "scheduled.overnight_precompute",
      dueOnly: false,
      sendNotifications: false,
    });
    if (result.orgsEligible === 0) {
      console.info(`[eligibility-refresh] No orgs eligible for overnight precompute (checked ${result.orgsChecked} orgs)`);
      return { skipped: true, ...result };
    }
    console.info(`[eligibility-refresh] Enqueued ${result.enqueued}/${result.orgsEligible} scoped overnight org refreshes`);
    return result;
  })
);

export const eligibilityRefreshRequested = inngest.createFunction(
  {
    id: "eligibility-refresh-requested",
    name: "Eligibility refresh scoped worker",
    concurrency: REFRESH_WORKER_CONCURRENCY,
  },
  { event: "eligibility/refresh.requested" },
  async ({ event }) => {
    const orgId = typeof event.data?.orgId === "string" ? event.data.orgId.trim() : "";
    const source = typeof event.data?.source === "string" ? event.data.source : "manual";
    const sendNotifications = event.data?.sendNotifications !== false;
    const bypassCache = /^(application\.outcome|profile\.)/.test(source);
    if (!orgId) {
      return enqueueEligibilityRefreshes({
        source: `${source}.fallback_enqueue`,
        dueOnly: false,
        sendNotifications,
      });
    }
    return runEligibilityRefreshJob({
      orgIdsFilter: new Set([orgId]),
      bypassCache,
      refreshReason: source,
      sendNotifications,
    });
  }
);

export const eligibilityRefreshEnqueueRequested = inngest.createFunction(
  { id: "eligibility-refresh-enqueue-requested", name: "Eligibility refresh enqueue request" },
  { event: "eligibility/refresh.enqueue.requested" },
  async ({ event }) => {
    const source = typeof event.data?.source === "string" ? event.data.source : "manual.enqueue";
    const dueOnly = event.data?.dueOnly !== false;
    const sendNotifications = event.data?.sendNotifications !== false;
    return runWithCronLog(
      { jobName: "Eligibility Refresh Enqueue", route: "inngest/eligibility-refresh.enqueue", trigger: "inngest" },
      () => enqueueEligibilityRefreshes({ source, dueOnly, sendNotifications })
    );
  }
);

export const eligibilityDeepScoreProcessRequested = inngest.createFunction(
  {
    id: "eligibility-deep-score-process-requested",
    name: "Eligibility deep-score process request",
    concurrency: DEEP_SCORE_WORKER_CONCURRENCY,
  },
  { event: "eligibility/deep-score.process" },
  async ({ event }) => {
    const limit = Number(event.data?.limit);
    const source = typeof event.data?.source === "string" ? event.data.source : "manual";
    return runWithCronLog(
      { jobName: "Eligibility Deep Score Queue", route: "inngest/eligibility-deep-score.process", trigger: "inngest" },
      () => processEligibilityDeepScoreQueue({
        limit: Number.isFinite(limit) && limit > 0 ? Math.min(100, Math.floor(limit)) : DEEP_SCORE_BATCH_SIZE,
        organisationId: typeof event.data?.organisationId === "string" ? event.data.organisationId : undefined,
        profileId: typeof event.data?.profileId === "string" ? event.data.profileId : undefined,
      }).then((processed) => ({ source, processed }))
    );
  }
);

export const eligibilityDeepScoreScheduled = inngest.createFunction(
  {
    id: "eligibility-deep-score-scheduled",
    name: "Eligibility deep-score queue hourly",
    concurrency: 1,
  },
  { cron: "15 * * * *" },
  async () => runWithCronLog(
    { jobName: "Eligibility Deep Score Queue Legacy Scheduler", route: "inngest/eligibility-deep-score.hourly", trigger: "inngest" },
    async () => ({
      skipped: true,
      reason: "Vercel /api/cron/deep-score-queue is the authoritative hourly scheduler.",
    })
  )
);
