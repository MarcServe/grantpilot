import { getSupabaseAdmin } from "@/lib/supabase";

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

const TRUSTED_SCORING_SOURCES = ["openai", "intelligence"] as const;
const BOOTSTRAP_VISIBLE_SCORE_TARGET = 10;

export type ProfileBootstrapStatus = {
  profileReady: boolean;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  trustedScores: number;
  strongMatches: number;
  withinReach: number;
  showStatus: boolean;
};

async function countQueueRows(
  supabase: SupabaseAdmin,
  organisationId: string,
  profileId: string,
  status: "pending" | "running" | "completed" | "failed"
): Promise<number> {
  const { count, error } = await supabase
    .from("eligibility_deep_score_queue")
    .select("id", { count: "exact", head: true })
    .eq("organisation_id", organisationId)
    .eq("profile_id", profileId)
    .eq("status", status);

  if (error) throw error;
  return count ?? 0;
}

async function countTrustedScores(
  supabase: SupabaseAdmin,
  organisationId: string,
  profileId: string,
  range?: "strong" | "within"
): Promise<number> {
  let query = supabase
    .from("EligibilityAssessment")
    .select("id", { count: "exact", head: true })
    .eq("organisation_id", organisationId)
    .eq("profile_id", profileId)
    .in("scoring_source", TRUSTED_SCORING_SOURCES as unknown as string[]);

  if (range === "strong") query = query.gte("score", 85);
  if (range === "within") query = query.gte("score", 50).lt("score", 85);

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function getProfileBootstrapStatus(options: {
  supabase?: SupabaseAdmin;
  organisationId: string;
  profileId: string;
  completionScore: number;
}): Promise<ProfileBootstrapStatus> {
  const profileReady = options.completionScore >= 50;
  if (!profileReady) {
    return {
      profileReady: false,
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      trustedScores: 0,
      strongMatches: 0,
      withinReach: 0,
      showStatus: false,
    };
  }

  try {
    const supabase = options.supabase ?? getSupabaseAdmin();
    const [
      pending,
      running,
      completed,
      failed,
      trustedScores,
      strongMatches,
      withinReach,
    ] = await Promise.all([
      countQueueRows(supabase, options.organisationId, options.profileId, "pending"),
      countQueueRows(supabase, options.organisationId, options.profileId, "running"),
      countQueueRows(supabase, options.organisationId, options.profileId, "completed"),
      countQueueRows(supabase, options.organisationId, options.profileId, "failed"),
      countTrustedScores(supabase, options.organisationId, options.profileId),
      countTrustedScores(supabase, options.organisationId, options.profileId, "strong"),
      countTrustedScores(supabase, options.organisationId, options.profileId, "within"),
    ]);

    const activeQueue = pending + running;
    const showStatus = activeQueue > 0 || trustedScores < BOOTSTRAP_VISIBLE_SCORE_TARGET;

    return {
      profileReady,
      pending,
      running,
      completed,
      failed,
      trustedScores,
      strongMatches,
      withinReach,
      showStatus,
    };
  } catch (error) {
    console.warn(
      "[profile-bootstrap-status] lookup failed:",
      error instanceof Error ? error.message : String(error)
    );

    return {
      profileReady,
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      trustedScores: 0,
      strongMatches: 0,
      withinReach: 0,
      showStatus: true,
    };
  }
}
