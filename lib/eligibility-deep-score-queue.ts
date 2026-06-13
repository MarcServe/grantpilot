import { getEligibilityDecision } from "@/lib/claude";
import {
  grantContentHashForEligibility,
  profileHashForEligibility,
  touchEligibilityAiCaches,
} from "@/lib/eligibility-ai-cache";
import { finalEligibilityScore, finaliseEligibilityAssessment } from "@/lib/eligibility-final-score";
import { verifyGrantActionable } from "@/lib/grant-actionability";
import { buildFundingOutcomeSignals, deriveOutcomeLearningAdvisory } from "@/lib/outcome-learning";
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
};

export type DeepScoreCandidate = {
  grant: GrantRow;
  heuristicScore: number;
  reason?: string | null;
  source?: string | null;
};

function positiveIntFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export const DEEP_SCORE_BATCH_SIZE = positiveIntFromEnv("ELIGIBILITY_DEEP_SCORE_QUEUE_BATCH_SIZE", 50);

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

function priorityForCandidate(candidate: DeepScoreCandidate): number {
  const score = Math.max(0, Math.min(100, Number(candidate.heuristicScore) || 0));
  const deadline = candidate.grant.deadline ? new Date(candidate.grant.deadline).getTime() : 0;
  const deadlineBonus = Number.isFinite(deadline) && deadline > Date.now() ? 10 : 0;
  return Math.round(score * 10 + deadlineBonus);
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

    const { error } = await supabase.from("eligibility_deep_score_queue").upsert(rows, {
      onConflict: "organisation_id,profile_id,grant_id,profile_hash,grant_content_hash",
    });
    if (error) throw error;
    return { requested, enqueued: rows.length };
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
    const { data, error } = await supabase
      .from("EligibilityAssessment")
      .select("organisation_id, profile_id, grant_id, score, summary, scoring_source, updated_at")
      .in("scoring_source", ["heuristic", "embedding"])
      .gte("score", minScore)
      .order("score", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    const assessments = (data ?? []) as Array<{
      organisation_id: string | null;
      profile_id: string | null;
      grant_id: string | null;
      score: number | null;
      scoring_source?: string | null;
    }>;

    const profileIds = Array.from(new Set(assessments.map((row) => row.profile_id).filter(Boolean))) as string[];
    const grantIds = Array.from(new Set(assessments.map((row) => row.grant_id).filter(Boolean))) as string[];
    if (profileIds.length === 0 || grantIds.length === 0) {
      return { scanned: assessments.length, enqueued: 0 };
    }

    const [profilesResult, grantsResult] = await Promise.all([
      supabase.from("BusinessProfile").select("*").in("id", profileIds),
      supabase
        .from("Grant")
        .select("id, name, funder, amount, deadline, applicationUrl, eligibility, description, objectives, applicantTypes, sectors, regions, url_status")
        .in("id", grantIds),
    ]);
    if (profilesResult.error) throw profilesResult.error;
    if (grantsResult.error) throw grantsResult.error;

    const profilesById = new Map(((profilesResult.data ?? []) as ProfileRow[]).map((profile) => [String(profile.id), profile]));
    const grantsById = new Map(((grantsResult.data ?? []) as GrantRow[]).map((grant) => [grant.id, grant]));
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

    return { scanned: assessments.length, enqueued, error: errors[0] };
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

export async function processEligibilityDeepScoreQueue(options?: {
  supabase?: SupabaseAdmin;
  limit?: number;
  organisationId?: string;
  profileId?: string;
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
  let query = supabase
    .from("eligibility_deep_score_queue")
    .select("id, organisation_id, profile_id, grant_id, attempts")
    .eq("status", "pending")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(limit);
  if (options?.organisationId) query = query.eq("organisation_id", options.organisationId);
  if (options?.profileId) query = query.eq("profile_id", options.profileId);

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as DeepQueueRow[];
  if (rows.length === 0) {
    return { requested: 0, completed: 0, failed: 0, skipped: 0, highestScore: 0, eligible85Plus: 0 };
  }

  const ids = rows.map((row) => row.id);
  await supabase
    .from("eligibility_deep_score_queue")
    .update({ status: "running", locked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .in("id", ids);

  const profileIds = Array.from(new Set(rows.map((row) => row.profile_id)));
  const grantIds = Array.from(new Set(rows.map((row) => row.grant_id)));
  const [profilesResult, grantsResult] = await Promise.all([
    supabase.from("BusinessProfile").select("*").in("id", profileIds),
    supabase
      .from("Grant")
      .select("id, name, funder, amount, deadline, applicationUrl, eligibility, description, objectives, applicantTypes, sectors, regions, url_status")
      .in("id", grantIds),
  ]);
  if (profilesResult.error) throw profilesResult.error;
  if (grantsResult.error) throw grantsResult.error;

  const profilesById = new Map(((profilesResult.data ?? []) as ProfileRow[]).map((profile) => [String(profile.id), profile]));
  const grantsById = new Map(((grantsResult.data ?? []) as GrantRow[]).map((grant) => [grant.id, grant]));
  const outcomeCache = new Map<string, ReturnType<typeof deriveOutcomeLearningAdvisory>>();
  let completed = 0;
  let failed = 0;
  let skipped = 0;
  let highestScore = 0;
  let eligible85Plus = 0;

  for (const row of rows) {
    try {
      const profile = profilesById.get(row.profile_id);
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
