import type { SupabaseClient } from "@supabase/supabase-js";
import { markGrantUserState } from "@/lib/grant-user-state";
import { clearEligibleMatchCaches } from "@/lib/eligible-match-cache";

export async function saveRecommendationFeedback(db: SupabaseClient, input: {
  organisationId: string; profileId: string; grantId: string; userId?: string;
  category: string; note?: string; source?: string;
}) {
  const applied = input.category === "already_applied";
  // This is an operational status change, independent of optional feedback logging.
  if (applied) {
    await markGrantUserState(db, { organisationId: input.organisationId, profileId: input.profileId, grantId: input.grantId, status: "applied" });
    clearEligibleMatchCaches();
  }
  const { error } = await db.from("RecommendationFeedback").insert({
    organisation_id: input.organisationId, profile_id: input.profileId, grant_id: input.grantId,
    user_id: input.userId, category: input.category, note: input.note?.trim() || null,
    source: input.source?.trim() || "grant_card",
  });
  if (error) {
    if (!applied) throw new Error(error.message);
    console.warn("[RECOMMENDATION_FEEDBACK] Applied status saved; feedback log unavailable:", error.message);
  }
  return { ok: true, feedbackStored: !error, ...(applied ? { grantState: "applied" as const } : {}) };
}
