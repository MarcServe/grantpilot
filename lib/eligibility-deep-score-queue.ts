import { getEligibilityDecision } from "@/lib/claude";
import {
  grantContentHashForEligibility,
  profileHashForEligibility,
  touchEligibilityAiCaches,
} from "@/lib/eligibility-ai-cache";
import { finalEligibilityScore, finaliseEligibilityAssessment } from "@/lib/eligibility-final-score";
import { isGrantActionableNow, verifyGrantActionable } from "@/lib/grant-actionability";
import { buildFundingOutcomeSignals, deriveOutcomeLearningAdvisory } from "@/lib/outcome-learning";
import { isFreeTrialActive, resolvePlanKey, type PlanAccessSource } from "@/lib/plan-features";
import { PLAN_RANK } from "@/lib/plans";
import { getSupabaseAdmin } from "@/lib/supabase";

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

type ProfileRow = Record<string, unknown> & {
  id?: string;
  organisationId?: string | null;
  organisation_id?: string | null;
};

type GrantRow = {
  id: string;
  name: string;
  funder: string;
  amount?: number | null;
  deadline?: string | null;
  applicationUrl?: string | null;
  createdAt?: string | null;
  eligibility: string;
  description?: string | null;
  objectives?: string | null;
  applicantTypes?: string[] | null;
  sectors?: string[] | null;
  regions?: string[] | null;
  url_status?: string | null;
};

type DeepQueueRow = {
  id: string;
  organisation_id: string;
  profile_id: string;
  grant_id: string;
  heuristic_score: number | null;
  attempts: number | null;
  priority?: number | null;
  created_at?: string | null;
};

type OrganisationPlanRow = PlanAccessSource & {
  id?: string;
  name?: string | null;
};

export type DeepScoreCandidate = {
  grant: GrantRow;
  heuristicScore: number;
  reason?: string | null;
  source?: string | null;
};

type PreliminaryAssessmentRow = {
  organisation_id: string | null;
  profile_id: string | null;
  grant_id: string | null;
  score: number | null;
  scoring_source?: string | null;
  updated_at?: string | null;
};

function positiveIntFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export const DEEP_SCORE_BATCH_SIZE = positiveIntFromEnv("ELIGIBILITY_DEEP_SCORE_QUEUE_BATCH_SIZE", 50);
const MIN_DEEP_SCORE_PROFILE_COMPLETION = positiveIntFromEnv("ELIGIBILITY_DEEP_SCORE_MIN_PROFILE_COMPLETION", 50);
const MAX_QUEUE_SCAN_LIMIT = positiveIntFromEnv("ELIGIBILITY_DEEP_SCORE_QUEUE_SCAN_LIMIT", 10000);
const FRESH_DEEP_SCORE_WINDOW_DAYS = positiveIntFromEnv("ELIGIBILITY_DEEP_SCORE_FRESH_DAYS", 31);
const FRESH_DEEP_SCORE_PRIORITY_BONUS = positiveIntFromEnv("ELIGIBILITY_DEEP_SCORE_FRESH_PRIORITY_BONUS", 500);
const STALE_RUNNING_LOCK_MINUTES = positiveIntFromEnv("ELIGIBILITY_DEEP_SCORE_STALE_LOCK_MINUTES", 20);

function valueAsString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function profileValue(profile: Record<string, unknown>, key: string): unknown {
  return profile[key] ?? profile[key.replace(/([A-Z])/g, "_$1").toLowerCase()];
}

function getProfileCompletionScore(profile: Record<string, unknown> | null | undefined): number {
  if (!profile) return 0;
  const raw = profile.completionScore ?? profile.completion_score;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 0;
}

function hasUsefulProfileIdentity(profile: Record<string, unknown> | null | undefined): boolean {
  if (!profile) return false;
  const businessName = valueAsString(profileValue(profile, "businessName"));
  const sector = valueAsString(profileValue(profile, "sector"));
  const mission = valueAsString(profileValue(profile, "missionStatement"));
  const description = valueAsString(profileValue(profile, "description"));
  const location = valueAsString(profileValue(profile, "location"));
  return businessName.length > 1 && [sector, mission, description, location].some((value) => value.length > 1);
}

function orgPlanPriority(org: OrganisationPlanRow | null | undefined): number | null {
  if (!org) return null;
  const plan = resolvePlanKey(org.plan);
  if (plan === "FREE_TRIAL") return isFreeTrialActive(org) ? 1000 : null;
  return 2000 + PLAN_RANK[plan] * 1000;
}

export function deepScoreProfilePriority(
  profile: Record<string, unknown> | null | undefined,
  org: OrganisationPlanRow | null | undefined
): number | null {
  const completionScore = getProfileCompletionScore(profile);
  if (completionScore < MIN_DEEP_SCORE_PROFILE_COMPLETION) return null;
  if (!hasUsefulProfileIdentity(profile)) return null;

  const planPriority = orgPlanPriority(org);
  if (planPriority == null) return null;
  return planPriority + completionScore;
}

export function profileQualifiesForDeepScoring(
  profile: Record<string, unknown> | null | undefined,
  org: OrganisationPlanRow | null | undefined
): boolean {
  return deepScoreProfilePriority(profile, org) != null;
}

function orgIdFromProfile(profile: ProfileRow): string | null {
  const orgId = profile.organisationId ?? profile.organisation_id;
  return typeof orgId === "string" && orgId.trim() ? orgId.trim() : null;
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

function grantToMatching(grant: GrantRow) {
  return {
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
  };
}

function dateTime(value?: string | null): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function isFreshDeepScoreGrant(grant: Pick<GrantRow, "createdAt">): boolean {
  const addedAt = dateTime(grant.createdAt);
  if (!addedAt) return false;
  return addedAt >= Date.now() - FRESH_DEEP_SCORE_WINDOW_DAYS * 86_400_000;
}

function priorityForCandidate(candidate: DeepScoreCandidate): number {
  const score = Math.max(0, Math.min(100, Number(candidate.heuristicScore) || 0));
  const deadline = candidate.grant.deadline ? new Date(candidate.grant.deadline).getTime() : 0;
  const deadlineBonus = Number.isFinite(deadline) && deadline > Date.now() ? 10 : 0;
  const freshnessBonus = isFreshDeepScoreGrant(candidate.grant) ? FRESH_DEEP_SCORE_PRIORITY_BONUS : 0;
  return Math.round(score * 10 + deadlineBonus + freshnessBonus);
}

function selectFairRows<T extends { organisation_id: string | null; profile_id: string | null }>(
  rows: T[],
  limit: number
): T[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = `${row.organisation_id ?? "unknown"}:${row.profile_id ?? "unknown"}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  const selected: T[] = [];
  const queues = Array.from(groups.values());
  while (selected.length < limit && queues.some((group) => group.length > 0)) {
    for (const group of queues) {
      const next = group.shift();
      if (!next) continue;
      selected.push(next);
      if (selected.length >= limit) break;
    }
  }
  return selected;
}

export async function enqueueDeepScoreCandidates(options: {
  supabase?: SupabaseAdmin;
  organisationId: string;
  profileId: string;
  profile: ProfileRow;
  candidates: DeepScoreCandidate[];
  source?: string;
}): Promise<{ requested: number; enqueued: number; error?: string }> {
  const requested = options.candidates.length;
  if (requested === 0) return { requested, enqueued: 0 };

  try {
    const supabase = options.supabase ?? getSupabaseAdmin();
    const orgResult = await supabase
      .from("Organisation")
      .select("id, plan, createdAt")
      .eq("id", options.organisationId)
      .maybeSingle();
    if (orgResult.error) throw orgResult.error;

    if (deepScoreProfilePriority(options.profile, orgResult.data as OrganisationPlanRow | null) == null) {
      return { requested, enqueued: 0 };
    }

    const now = new Date().toISOString();
    const rows = options.candidates.map((candidate) => {
      const profileHash = profileHashForEligibility(options.profile);
      const grantContentHash = grantContentHashForEligibility(candidate.grant);
      return {
        organisation_id: options.organisationId,
        profile_id: options.profileId,
        grant_id: candidate.grant.id,
        source: candidate.source ?? options.source ?? "eligibility_refresh",
        status: "pending",
        priority: priorityForCandidate(candidate),
        heuristic_score: Math.min(69, Math.max(0, Math.round(Number(candidate.heuristicScore) || 0))),
        profile_hash: profileHash,
        grant_content_hash: grantContentHash,
        last_error: null,
        updated_at: now,
      };
    });

    const profileHash = rows[0]?.profile_hash;
    const grantIds = rows.map((row) => row.grant_id);
    const existingResult = profileHash && grantIds.length > 0
      ? await supabase
        .from("eligibility_deep_score_queue")
        .select("grant_id, profile_hash, grant_content_hash, status")
        .eq("organisation_id", options.organisationId)
        .eq("profile_id", options.profileId)
        .eq("profile_hash", profileHash)
        .in("grant_id", grantIds)
      : { data: [], error: null };
    if (existingResult.error) throw existingResult.error;

    const existingByKey = new Map(
      ((existingResult.data ?? []) as Array<{
        grant_id: string;
        profile_hash: string | null;
        grant_content_hash: string | null;
        status: string | null;
      }>).map((row) => [`${row.grant_id}:${row.profile_hash ?? ""}:${row.grant_content_hash ?? ""}`, row])
    );
    const rowsToUpsert = rows.filter((row) => {
      const existing = existingByKey.get(`${row.grant_id}:${row.profile_hash}:${row.grant_content_hash}`);
      return !existing || existing.status === "pending";
    });
    if (rowsToUpsert.length === 0) return { requested, enqueued: 0 };

    const { data, error } = await supabase.from("eligibility_deep_score_queue").upsert(rowsToUpsert, {
      onConflict: "organisation_id,profile_id,grant_id,profile_hash,grant_content_hash",
    }).select("id");
    if (error) throw error;
    return { requested, enqueued: data?.length ?? 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[eligibility-deep-score-queue] enqueue skipped:", message);
    return { requested, enqueued: 0, error: message };
  }
}

export async function enqueueExistingHeuristicAssessments(options?: {
  supabase?: SupabaseAdmin;
  limit?: number;
  minScore?: number;
}): Promise<{ scanned: number; enqueued: number; error?: string }> {
  try {
    const supabase = options?.supabase ?? getSupabaseAdmin();
    const limit = Math.max(1, Math.min(1000, options?.limit ?? 500));
    const minScore = Math.max(0, Math.min(100, options?.minScore ?? 40));
    const scanLimit = Math.max(limit, Math.min(MAX_QUEUE_SCAN_LIMIT, limit * 20));
    const scannedAssessments: PreliminaryAssessmentRow[] = [];
    const pageSize = Math.min(1000, scanLimit);

    for (let from = 0; from < scanLimit; from += pageSize) {
      const to = Math.min(scanLimit - 1, from + pageSize - 1);
      const { data, error } = await supabase
        .from("EligibilityAssessment")
        .select("organisation_id, profile_id, grant_id, score, scoring_source, updated_at")
        .in("scoring_source", ["heuristic", "embedding", "intelligence"])
        .gte("score", minScore)
        .order("score", { ascending: false })
        .order("updated_at", { ascending: false })
        .range(from, to);

      if (error) throw error;
      const page = (data ?? []) as PreliminaryAssessmentRow[];
      scannedAssessments.push(...page);
      if (page.length < pageSize) break;
    }

    const profileIds = Array.from(new Set(scannedAssessments.map((row) => row.profile_id).filter(Boolean))) as string[];
    if (profileIds.length === 0) {
      return { scanned: scannedAssessments.length, enqueued: 0 };
    }

    const profilesResult = await supabase.from("BusinessProfile").select("*").in("id", profileIds);
    if (profilesResult.error) throw profilesResult.error;

    const profilesById = new Map(((profilesResult.data ?? []) as ProfileRow[]).map((profile) => [String(profile.id), profile]));
    const orgIds = Array.from(new Set([
      ...scannedAssessments.map((row) => row.organisation_id),
      ...((profilesResult.data ?? []) as ProfileRow[]).map((profile) => orgIdFromProfile(profile)),
    ].filter(Boolean))) as string[];
    const orgsResult = orgIds.length > 0
      ? await supabase.from("Organisation").select("id, plan, createdAt").in("id", orgIds)
      : { data: [], error: null };
    if (orgsResult.error) throw orgsResult.error;
    const orgsById = new Map(((orgsResult.data ?? []) as OrganisationPlanRow[]).map((org) => [String(org.id), org]));

    const eligibleAssessments = scannedAssessments
      .map((assessment) => {
        if (!assessment.profile_id || !assessment.grant_id) return null;
        const profile = profilesById.get(assessment.profile_id);
        const orgId = assessment.organisation_id || (profile ? orgIdFromProfile(profile) : null);
        const org = orgId ? orgsById.get(orgId) : null;
        const selectionPriority = deepScoreProfilePriority(profile, org);
        if (selectionPriority == null || !orgId) return null;
        return {
          ...assessment,
          organisation_id: orgId,
          _selectionPriority: selectionPriority,
        };
      })
      .filter((assessment): assessment is NonNullable<typeof assessment> => assessment != null)
      .sort((a, b) => {
        if ((b._selectionPriority ?? 0) !== (a._selectionPriority ?? 0)) {
          return (b._selectionPriority ?? 0) - (a._selectionPriority ?? 0);
        }
        if ((b.score ?? 0) !== (a.score ?? 0)) return (b.score ?? 0) - (a.score ?? 0);
        return new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime();
      });
    const candidateAssessments = selectFairRows(
      eligibleAssessments,
      Math.min(eligibleAssessments.length, Math.max(limit, Math.min(1000, limit * 4)))
    );
    const grantIds = Array.from(new Set(candidateAssessments.map((row) => row.grant_id).filter(Boolean))) as string[];
    if (grantIds.length === 0) {
      return { scanned: scannedAssessments.length, enqueued: 0 };
    }

    const grantsResult = await supabase
      .from("Grant")
      .select("id, name, funder, amount, deadline, applicationUrl, createdAt, eligibility, description, objectives, applicantTypes, sectors, regions, url_status")
      .in("id", grantIds);
    if (grantsResult.error) throw grantsResult.error;

    const grantsById = new Map(((grantsResult.data ?? []) as GrantRow[]).map((grant) => [grant.id, grant]));
    const actionableAssessments = candidateAssessments
      .map((assessment) => {
        if (!assessment.organisation_id || !assessment.profile_id || !assessment.grant_id) return null;
        const profile = profilesById.get(assessment.profile_id);
        const grant = grantsById.get(assessment.grant_id);
        if (!profile || !grant || !isGrantActionableNow(grant)) return null;
        return {
          ...assessment,
          _freshGrant: isFreshDeepScoreGrant(grant),
        };
      })
      .filter((assessment): assessment is NonNullable<typeof assessment> => assessment != null)
      .sort((a, b) => {
        if (a._freshGrant !== b._freshGrant) return a._freshGrant ? -1 : 1;
        if ((b._selectionPriority ?? 0) !== (a._selectionPriority ?? 0)) {
          return (b._selectionPriority ?? 0) - (a._selectionPriority ?? 0);
        }
        if ((b.score ?? 0) !== (a.score ?? 0)) return (b.score ?? 0) - (a.score ?? 0);
        return new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime();
      });
    const assessments = selectFairRows(actionableAssessments, limit);
    const grouped = new Map<string, {
      organisationId: string;
      profileId: string;
      profile: ProfileRow;
      candidates: DeepScoreCandidate[];
    }>();

    for (const assessment of assessments) {
      if (!assessment.organisation_id || !assessment.profile_id || !assessment.grant_id) continue;
      const profile = profilesById.get(assessment.profile_id);
      const grant = grantsById.get(assessment.grant_id);
      if (!profile || !grant) continue;
      const orgId = assessment.organisation_id || orgIdFromProfile(profile);
      if (!orgId) continue;
      const key = `${orgId}:${assessment.profile_id}`;
      const group = grouped.get(key) ?? {
        organisationId: orgId,
        profileId: assessment.profile_id,
        profile,
        candidates: [],
      };
      group.candidates.push({
        grant,
        heuristicScore: Number(assessment.score ?? 0),
        source: assessment.scoring_source ? `${assessment.scoring_source}_backlog` : "preliminary_backlog",
      });
      grouped.set(key, group);
    }

    let enqueued = 0;
    const errors: string[] = [];
    for (const group of grouped.values()) {
      const result = await enqueueDeepScoreCandidates({
        supabase,
        organisationId: group.organisationId,
        profileId: group.profileId,
        profile: group.profile,
        source: "heuristic_backlog",
        candidates: group.candidates,
      });
      enqueued += result.enqueued;
      if (result.error) errors.push(result.error);
    }

    return { scanned: scannedAssessments.length, enqueued, error: errors[0] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[eligibility-deep-score-queue] heuristic enqueue failed:", message);
    return { scanned: 0, enqueued: 0, error: message };
  }
}

async function markQueueRow(
  supabase: SupabaseAdmin,
  id: string,
  values: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase
    .from("eligibility_deep_score_queue")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

async function resetStaleRunningQueueRows(supabase: SupabaseAdmin): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_RUNNING_LOCK_MINUTES * 60_000).toISOString();
  const { error } = await supabase
    .from("eligibility_deep_score_queue")
    .update({
      status: "pending",
      locked_at: null,
      last_error: "Recovered from stale running lock.",
      updated_at: new Date().toISOString(),
    })
    .eq("status", "running")
    .lt("locked_at", cutoff);

  if (error) {
    console.warn("[eligibility-deep-score-queue] stale lock recovery failed:", error.message);
  }
}

function isMissingClaimFunction(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : (typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message)
      : String(error));
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : "";
  return code === "PGRST202" || /claim_eligibility_deep_score_queue|function .* does not exist/i.test(message);
}

async function fetchPendingQueueRows(
  supabase: SupabaseAdmin,
  options: {
    scanLimit: number;
    organisationId?: string;
    profileId?: string;
  }
): Promise<DeepQueueRow[]> {
  let query = supabase
    .from("eligibility_deep_score_queue")
    .select("id, organisation_id, profile_id, grant_id, attempts, priority, heuristic_score, created_at")
    .eq("status", "pending")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(options.scanLimit);
  if (options.organisationId) query = query.eq("organisation_id", options.organisationId);
  if (options.profileId) query = query.eq("profile_id", options.profileId);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as DeepQueueRow[];
}

export async function processEligibilityDeepScoreQueue(options?: {
  supabase?: SupabaseAdmin;
  limit?: number;
  organisationId?: string;
  profileId?: string;
  shardCount?: number;
  shardIndex?: number;
  respectUsageLimits?: boolean;
}): Promise<{
  requested: number;
  completed: number;
  failed: number;
  skipped: number;
  highestScore: number;
  eligible85Plus: number;
}> {
  const supabase = options?.supabase ?? getSupabaseAdmin();
  const limit = Math.max(1, Math.min(100, options?.limit ?? DEEP_SCORE_BATCH_SIZE));
  const respectUsageLimits = options?.respectUsageLimits === true;
  const scanLimit = options?.organisationId || options?.profileId ? limit : Math.max(limit, Math.min(1000, limit * 8));
  const shardCount = Number.isFinite(options?.shardCount) && Number(options?.shardCount) > 1
    ? Math.min(20, Math.floor(Number(options?.shardCount)))
    : undefined;
  const shardIndex = shardCount && Number.isFinite(options?.shardIndex)
    ? Math.max(0, Math.min(shardCount - 1, Math.floor(Number(options?.shardIndex))))
    : undefined;
  const canUseAtomicClaim = !options?.organisationId && !options?.profileId;
  let rowsAreClaimed = false;
  let rawRows: DeepQueueRow[] = [];

  await resetStaleRunningQueueRows(supabase);

  if (canUseAtomicClaim) {
    const { data, error } = await supabase.rpc("claim_eligibility_deep_score_queue", {
      p_limit: scanLimit,
      p_shard_count: shardCount ?? null,
      p_shard_index: shardIndex ?? null,
    });
    if (error) {
      if (!isMissingClaimFunction(error)) throw error;
      console.warn("[eligibility-deep-score-queue] atomic claim function missing; falling back to non-atomic claim");
      rawRows = shardCount && shardIndex != null && shardIndex > 0
        ? []
        : await fetchPendingQueueRows(supabase, { scanLimit });
    } else {
      rawRows = (data ?? []) as DeepQueueRow[];
      rowsAreClaimed = true;
    }
  } else {
    rawRows = await fetchPendingQueueRows(supabase, {
      scanLimit,
      organisationId: options?.organisationId,
      profileId: options?.profileId,
    });
  }

  if (rawRows.length === 0) {
    return { requested: 0, completed: 0, failed: 0, skipped: 0, highestScore: 0, eligible85Plus: 0 };
  }

  const rawProfileIds = Array.from(new Set(rawRows.map((row) => row.profile_id).filter(Boolean)));
  const profilesResult = rawProfileIds.length > 0
    ? await supabase.from("BusinessProfile").select("*").in("id", rawProfileIds)
    : { data: [], error: null };
  if (profilesResult.error) throw profilesResult.error;
  const profilesById = new Map(((profilesResult.data ?? []) as ProfileRow[]).map((profile) => [String(profile.id), profile]));
  const rawOrgIds = Array.from(new Set([
    ...rawRows.map((row) => row.organisation_id),
    ...((profilesResult.data ?? []) as ProfileRow[]).map((profile) => orgIdFromProfile(profile)),
  ].filter(Boolean))) as string[];
  const orgsResult = rawOrgIds.length > 0
    ? await supabase.from("Organisation").select("id, plan, createdAt").in("id", rawOrgIds)
    : { data: [], error: null };
  if (orgsResult.error) throw orgsResult.error;
  const orgsById = new Map(((orgsResult.data ?? []) as OrganisationPlanRow[]).map((org) => [String(org.id), org]));

  const eligibleRows: Array<DeepQueueRow & { _selectionPriority: number }> = [];
  const ineligibleRows: DeepQueueRow[] = [];
  for (const row of rawRows) {
    const profile = profilesById.get(row.profile_id);
    const orgId = row.organisation_id || (profile ? orgIdFromProfile(profile) : null);
    const org = orgId ? orgsById.get(orgId) : null;
    const selectionPriority = deepScoreProfilePriority(profile, org);
    if (selectionPriority == null || !orgId) {
      ineligibleRows.push(row);
      continue;
    }
    eligibleRows.push({ ...row, organisation_id: orgId, _selectionPriority: selectionPriority });
  }

  if (ineligibleRows.length > 0) {
    await supabase
      .from("eligibility_deep_score_queue")
      .update({
        status: "skipped",
        last_error: "Profile is incomplete or organisation trial is inactive for platform deep scoring.",
        updated_at: new Date().toISOString(),
      })
      .in("id", ineligibleRows.map((row) => row.id));
  }

  const rows = selectFairRows(
    eligibleRows.sort((a, b) => {
      if (b._selectionPriority !== a._selectionPriority) return b._selectionPriority - a._selectionPriority;
      if ((b.priority ?? 0) !== (a.priority ?? 0)) return (b.priority ?? 0) - (a.priority ?? 0);
      if ((b.heuristic_score ?? 0) !== (a.heuristic_score ?? 0)) return (b.heuristic_score ?? 0) - (a.heuristic_score ?? 0);
      return new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime();
    }),
    limit
  );
  const selectedIds = new Set(rows.map((row) => row.id));
  const unselectedClaimedRows = rowsAreClaimed
    ? eligibleRows.filter((row) => !selectedIds.has(row.id))
    : [];
  if (unselectedClaimedRows.length > 0) {
    await supabase
      .from("eligibility_deep_score_queue")
      .update({
        status: "pending",
        locked_at: null,
        updated_at: new Date().toISOString(),
      })
      .in("id", unselectedClaimedRows.map((row) => row.id));
  }
  if (rows.length === 0) {
    return {
      requested: 0,
      completed: 0,
      failed: 0,
      skipped: ineligibleRows.length,
      highestScore: 0,
      eligible85Plus: 0,
    };
  }

  const ids = rows.map((row) => row.id);
  if (!rowsAreClaimed) {
    await supabase
      .from("eligibility_deep_score_queue")
      .update({ status: "running", locked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .in("id", ids);
  }

  const profileIds = Array.from(new Set(rows.map((row) => row.profile_id)));
  const grantIds = Array.from(new Set(rows.map((row) => row.grant_id)));
  const [selectedProfilesResult, grantsResult] = await Promise.all([
    supabase.from("BusinessProfile").select("*").in("id", profileIds),
    supabase
      .from("Grant")
      .select("id, name, funder, amount, deadline, applicationUrl, createdAt, eligibility, description, objectives, applicantTypes, sectors, regions, url_status")
      .in("id", grantIds),
  ]);
  if (selectedProfilesResult.error) throw selectedProfilesResult.error;
  if (grantsResult.error) throw grantsResult.error;

  const selectedProfilesById = new Map(((selectedProfilesResult.data ?? []) as ProfileRow[]).map((profile) => [String(profile.id), profile]));
  const grantsById = new Map(((grantsResult.data ?? []) as GrantRow[]).map((grant) => [grant.id, grant]));
  const outcomeCache = new Map<string, ReturnType<typeof deriveOutcomeLearningAdvisory>>();
  let completed = 0;
  let failed = 0;
  let skipped = ineligibleRows.length;
  let highestScore = 0;
  let eligible85Plus = 0;

  for (const row of rows) {
    try {
      const profile = selectedProfilesById.get(row.profile_id);
      const grant = grantsById.get(row.grant_id);
      if (!profile || !grant) {
        skipped++;
        await markQueueRow(supabase, row.id, { status: "skipped", last_error: "Missing profile or grant row." });
        continue;
      }

      const actionability = await verifyGrantActionable(grant, { supabase });
      if (!actionability.usable) {
        skipped++;
        await markQueueRow(supabase, row.id, {
          status: "skipped",
          last_error: actionability.message ?? actionability.reason ?? "Grant is not actionable.",
        });
        continue;
      }

      if (respectUsageLimits) {
        const { checkUsageLimit } = await import("@/lib/plan-check");
        const usage = await checkUsageLimit(row.organisation_id, "match");
        if (!usage.allowed) {
          skipped++;
          await markQueueRow(supabase, row.id, {
            status: "skipped",
            last_error: "Monthly match quota reached for this organisation.",
          });
          continue;
        }
      }

      await touchEligibilityAiCaches(profile, grant);
      const result = await getEligibilityDecision(profileToMatching(profile), grantToMatching(grant));
      let outcomeAdvisory = outcomeCache.get(row.profile_id);
      if (!outcomeAdvisory) {
        const { data: outcomeRows } = await supabase
          .from("ApplicationOutcome")
          .select("outcome, awardedAmount, funderFeedback, learningNotes, Grant(name, funder)")
          .eq("organisationId", row.organisation_id)
          .eq("profileId", row.profile_id)
          .order("reportedAt", { ascending: false })
          .limit(8);
        buildFundingOutcomeSignals(outcomeRows ?? []);
        outcomeAdvisory = deriveOutcomeLearningAdvisory(outcomeRows ?? []);
        outcomeCache.set(row.profile_id, outcomeAdvisory);
      }

      const adjustedResult = finaliseEligibilityAssessment(
        profile,
        {
          ...grant,
          applicantTypes: grant.applicantTypes ?? undefined,
          sectors: grant.sectors ?? [],
          regions: grant.regions ?? [],
        },
        result,
        outcomeAdvisory
      );
      const score = finalEligibilityScore(adjustedResult);
      const { error: upsertError } = await supabase.from("EligibilityAssessment").upsert(
        {
          organisation_id: row.organisation_id,
          profile_id: row.profile_id,
          grant_id: row.grant_id,
          score,
          decision: adjustedResult.decision,
          summary: adjustedResult.summary ?? adjustedResult.reason ?? undefined,
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
      if (upsertError) throw upsertError;

      if (respectUsageLimits) {
        // Kept as an opt-in escape hatch for any future user-triggered queue runner.
        // Admin and scheduled deep scoring are platform maintenance, so they do not
        // consume a customer's monthly match allowance.
        const { recordUsage } = await import("@/lib/plan-check");
        await recordUsage(row.organisation_id, "match").catch((error) =>
          console.warn("[eligibility-deep-score-queue] usage record failed:", error instanceof Error ? error.message : String(error))
        );
      }
      completed++;
      highestScore = Math.max(highestScore, score);
      if (score >= 85 && adjustedResult.decision === "likely_eligible") eligible85Plus++;
      await markQueueRow(supabase, row.id, {
        status: "completed",
        completed_at: new Date().toISOString(),
        full_score: score,
        full_decision: adjustedResult.decision,
        last_error: null,
      });
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : String(error);
      await markQueueRow(supabase, row.id, {
        status: "failed",
        attempts: (row.attempts ?? 0) + 1,
        last_error: message.slice(0, 1000),
      });
    }
  }

  return {
    requested: rows.length,
    completed,
    failed,
    skipped,
    highestScore,
    eligible85Plus,
  };
}
