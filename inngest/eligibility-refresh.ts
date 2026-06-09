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
import { getMatchHealthReport } from "@/lib/match-health";

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
  return isOpenAIChecked(scoringSource) && decision === "likely_eligible" && score >= MIN_NOTIFICATION_SCORE_FLOOR;
}

function isOutsideNotificationCooldown(notifiedAt: string | null | undefined, cooldown: Date): boolean {
  if (!notifiedAt) return true;
  const notifiedAtTime = new Date(notifiedAt).getTime();
  return !Number.isFinite(notifiedAtTime) || notifiedAtTime < cooldown.getTime();
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

function uniqueGrantIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  return unique;
}

async function fetchCurrentGrants(
  supabase: ReturnType<typeof getSupabaseAdmin>
): Promise<GrantRow[]> {
  const rows: GrantRow[] = [];

  for (let offset = 0; offset < MAX_GRANTS_PER_REFRESH; offset += GRANT_FETCH_BATCH_SIZE) {
    const { data, error } = await supabase
      .from("Grant")
      .select("id, name, funder, amount, deadline, applicationUrl, eligibility, description, objectives, applicantTypes, sectors, regions, funderLocations, required_attachments, url_status, createdAt")
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
}> {
    const orgIdsFilter = options?.orgIdsFilter;
    const bypassCache = options?.bypassCache === true;
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
        const sendWhatsApp = (prefs as { notify_whatsapp?: boolean } | null)?.notify_whatsapp ?? true;
        const sendNotifyEmail = (prefs as { notify_email?: boolean } | null)?.notify_email !== false;
        const canReceiveProactiveNotifications = await organisationAllowsCapability(orgId, "proactive_notifications");
        const recentWindow = recentNotificationWindow();

        const sendEligibilityStatusEmail = async (checkedGrantsCount: number, digestCandidateCount = 0) => {
          if (!sendNotifyEmail) return;
          const strongEligibleCount = Math.max(0, Math.round(digestCandidateCount));

          if (!canReceiveProactiveNotifications && strongEligibleCount > 0) {
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
        const suppressedGrantIds = await getSuppressedGrantIds(supabase, orgId, profileId);
        const actionableGrants = grantsList.filter(
          (g) => !appliedGrantIds.has(g.id) && !suppressedGrantIds.has(g.id)
        );
        console.info(
          `[eligibility-refresh]   Excluding ${appliedGrantIds.size} grants with existing applications and ${suppressedGrantIds.size} deferred/applied/dismissed grants`
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

        const cachedGrantIds = new Set((cachedRows ?? []).map((r: { grant_id: string }) => r.grant_id));
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
        const scoredByOpenAIIds = new Set<string>();
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

        const buildDigestItem = async (
          assessment: CachedEligibilityRow,
          range?: { minScore?: number; maxScore?: number }
        ): Promise<DigestGrantItem | null> => {
          const grant = grantsByIdForDigest.get(assessment.grant_id);
          if (!grant) return null;
          const actionability = await verifyGrantActionable(grant, { supabase });
          if (!actionability.usable) {
            console.info(
              `[eligibility-refresh]   Skipping stale grant ${grant.id}: ${actionability.message ?? actionability.reason ?? "not actionable"}`
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

        const buildCurrentStrongDigest = async (limit = 5): Promise<DigestGrantItem[]> => {
          const { data: currentRows, error: currentErr } = await supabase
            .from("EligibilityAssessment")
            .select("grant_id, updated_at, score, decision, summary, notified_at, missing_criteria, improvement_plan, scoring_source")
            .eq("organisation_id", orgId)
            .eq("profile_id", profileId)
            .eq("decision", "likely_eligible")
            .eq("scoring_source", "openai")
            .gte("score", minScore)
            .lte("score", maxScore)
            .order("updated_at", { ascending: false })
            .limit(30);

          if (currentErr) {
            console.error("[eligibility-refresh] current strong digest query", currentErr);
            return [];
          }

          const items: DigestGrantItem[] = [];
          for (const row of (currentRows ?? []) as CachedEligibilityRow[]) {
            const item = await buildDigestItem(row, { minScore, maxScore });
            if (item) items.push(item);
          }

          return items
            .sort((a, b) => {
              if (b.score !== a.score) return b.score - a.score;
              return grantCreatedTime(grantsByIdForDigest.get(b.grantId)) - grantCreatedTime(grantsByIdForDigest.get(a.grantId));
            })
            .slice(0, limit);
        };

        const buildCurrentWithinReachDigest = async (limit = 4): Promise<DigestGrantItem[]> => {
          const { data: currentRows, error: currentErr } = await supabase
            .from("EligibilityAssessment")
            .select("grant_id, updated_at, score, decision, summary, notified_at, missing_criteria, improvement_plan, scoring_source")
            .eq("organisation_id", orgId)
            .eq("profile_id", profileId)
            .eq("scoring_source", "openai")
            .gte("score", 50)
            .lte("score", maxScore)
            .order("updated_at", { ascending: false })
            .limit(40);

          if (currentErr) {
            console.error("[eligibility-refresh] current within-reach digest query", currentErr);
            return [];
          }

          const items: DigestGrantItem[] = [];
          for (const row of (currentRows ?? []) as CachedEligibilityRow[]) {
            const item = await buildDigestItem(row, { minScore: 50, maxScore: 79 });
            if (item) items.push(item);
          }

          return items
            .sort((a, b) => {
              if (b.score !== a.score) return b.score - a.score;
              return grantCreatedTime(grantsByIdForDigest.get(b.grantId)) - grantCreatedTime(grantsByIdForDigest.get(a.grantId));
            })
            .slice(0, limit);
        };
        let currentStrongDigestCache: DigestGrantItem[] | null = null;
        const getCurrentStrongDigest = async () => {
          if (!currentStrongDigestCache) currentStrongDigestCache = await buildCurrentStrongDigest();
          return currentStrongDigestCache;
        };

        for (const cached of (cachedRows ?? []) as CachedEligibilityRow[]) {
          const score = Number(cached.score ?? 0);
          if (
            !Number.isFinite(score) ||
            score < minScore ||
            score > maxScore ||
            !shouldNotifyForEligibility(score, cached.decision, cached.scoring_source) ||
            !isOutsideNotificationCooldown(cached.notified_at, cooldown)
          ) {
            continue;
          }

          const digestItem = await buildDigestItem(cached, { minScore, maxScore });
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
              score >= minScore &&
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
                  { minScore, maxScore }
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
          (r) => !scoredByOpenAIIds.has(r.grantId) && !cachedGrantIds.has(r.grantId)
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

        // ── Notification ──
        console.info(`[eligibility-refresh]   Digest candidates: ${digestGrants.length} grants, completion=${completionScore}%, threshold=${minCompletionForNotifications}%, email=${sendNotifyEmail}, whatsapp=${sendWhatsApp}`);

        const strongEligibleCount =
          digestGrants.length > 0 ? digestGrants.length : (await getCurrentStrongDigest()).length;

        if (!canReceiveProactiveNotifications && strongEligibleCount > 0 && sendNotifyEmail) {
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
          await notifyOrgMembers(orgId, "grant_scan_digest", {
            grants: digestGrants,
            withinReachGrants,
            profileName,
          }, {
            sendEmail: sendNotifyEmail,
            sendWhatsApp: false,
          });
          for (const item of digestGrants) {
            if (item.score >= eligibleThreshold && sendWhatsApp) {
              await notifyOrgMembers(orgId, "grant_match_high", {
                grantId: item.grantId,
                grantName: item.grantName,
                score: item.score,
                startApplicationToken: item.startApplicationToken,
              }, { sendEmail: sendNotifyEmail, sendWhatsApp: true });
            }
            await supabase
              .from("EligibilityAssessment")
              .update({ notified_at: new Date().toISOString() })
              .eq("organisation_id", orgId)
              .eq("profile_id", profileId)
              .eq("grant_id", item.grantId);
          }
          notifiedCount += digestGrants.length;
        } else if (digestGrants.length > 0 && completionScore < minCompletionForNotifications) {
          console.info(`[eligibility-refresh] Skipping digest: completion ${completionScore}% < ${minCompletionForNotifications}%`);
          await sendEligibilityStatusEmail(locationFiltered.length, strongEligibleCount);
        } else if (completionScore >= minCompletionForNotifications && sendNotifyEmail) {
          const alreadyUpdated = await orgHasNotificationSince(
            orgId,
            ["daily_grant_update", "grant_scan_digest", "grant_match_high", "eligibility_upgrade_prompt", "business_dna_match_health"],
            recentWindow
          );
          const currentStrongDigest = alreadyUpdated ? [] : await getCurrentStrongDigest();
          const currentWithinReachDigest = alreadyUpdated ? [] : await buildCurrentWithinReachDigest();
          if (currentStrongDigest.length > 0 || currentWithinReachDigest.length > 0) {
            console.info(
              `[eligibility-refresh]   SENDING current-match digest for ${currentStrongDigest.length} strong and ${currentWithinReachDigest.length} within-reach grants to org ${orgId}`
            );
            await notifyOrgMembers(orgId, "grant_scan_digest", {
              grants: currentStrongDigest,
              withinReachGrants: currentWithinReachDigest,
              profileName,
            }, {
              sendEmail: true,
              sendWhatsApp: false,
            });
            const topWhatsAppMatch = currentStrongDigest.find((item) => item.score >= eligibleThreshold);
            if (topWhatsAppMatch && sendWhatsApp) {
              await notifyOrgMembers(orgId, "grant_match_high", {
                grantId: topWhatsAppMatch.grantId,
                grantName: topWhatsAppMatch.grantName,
                score: topWhatsAppMatch.score,
                startApplicationToken: topWhatsAppMatch.startApplicationToken,
              }, {
                sendEmail: false,
                sendWhatsApp: true,
              });
            }
            diagnostics.dailyUpdates++;
            notifiedCount += currentStrongDigest.length;
            const notifiedAt = new Date().toISOString();
            for (const item of currentStrongDigest) {
              await supabase
                .from("EligibilityAssessment")
                .update({ notified_at: notifiedAt })
                .eq("organisation_id", orgId)
                .eq("profile_id", profileId)
                .eq("grant_id", item.grantId);
            }
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
  { id: "eligibility-refresh", name: "Eligibility 8:30 AM local (hourly check)" },
  { cron: "30 * * * *" },
  async () => runWithCronLog({ jobName: "Eligibility 8:30 AM local", route: "inngest/eligibility-refresh", trigger: "inngest" }, async () => {
    const supabase = getSupabaseAdmin();

    const { data: orgsData } = await supabase
      .from("Organisation")
      .select("id, preferredTimezone");

    const allOrgs = (orgsData ?? []) as { id: string; preferredTimezone?: string | null }[];
    const eligible = allOrgs.filter((o) =>
      isEligibilityNotificationTime(o.preferredTimezone ?? "UTC")
    );

    if (eligible.length === 0) {
      console.info(`[eligibility-refresh] No orgs at 8:30 AM local this hour (checked ${allOrgs.length} orgs)`);
      return { skipped: true, orgsChecked: allOrgs.length, orgsAtLocalTime: 0 };
    }

    const orgIds = new Set(eligible.map((o) => o.id));
    console.info(`[eligibility-refresh] ${eligible.length}/${allOrgs.length} orgs at 8:30 AM local — running pipeline`);
    return runEligibilityRefreshJob({ orgIdsFilter: orgIds });
  })
);

export const eligibilityRefreshRequested = inngest.createFunction(
  { id: "eligibility-refresh-requested", name: "Eligibility refresh on demand" },
  { event: "eligibility/refresh.requested" },
  async ({ event }) => {
    const orgId = typeof event.data?.orgId === "string" ? event.data.orgId.trim() : "";
    const source = typeof event.data?.source === "string" ? event.data.source : "manual";
    const bypassCache = /^(application\.outcome|profile\.)/.test(source);
    return runEligibilityRefreshJob(
      orgId
        ? { orgIdsFilter: new Set([orgId]), bypassCache, refreshReason: source }
        : { bypassCache, refreshReason: source }
    );
  }
);
