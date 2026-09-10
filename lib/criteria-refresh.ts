import { getSupabaseAdmin } from "@/lib/supabase";
import { inngest } from "@/inngest/client";
import { getProfileMatches } from "@/lib/profile-matches";
export async function queueCriteriaRefresh(
  orgId: string,
  profileId: string,
  grantId: string | null,
  before?: Record<string, string>,
  reextract = false,
  saveFacts?: () => Promise<void>,
) {
  const db = getSupabaseAdmin();
  const portfolio = before ? null : await getProfileMatches(orgId, profileId);
  const baseline =
    before ??
    Object.fromEntries(
      Object.entries(portfolio!.sections).flatMap(([section, grants]) =>
        grants.map((g) => [g.grantId, section]),
      ),
    );
  const { data, error } = await db
    .from("criteria_refresh_runs")
    .insert({
      organisation_id: orgId,
      profile_id: profileId,
      grant_id: grantId,
      before_matches: baseline,
      reextract,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  try {
    await saveFacts?.();
  } catch (error) {
    await db
      .from("criteria_refresh_runs")
      .update({
        status: "failed",
        error: "Facts could not be saved. Review your answers and try again.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    throw error;
  }
  try {
    await inngest.send({
      name: "criteria/refresh.requested",
      data: { runId: data.id, profileId, reextract },
    });
  } catch {
    await db
      .from("criteria_refresh_runs")
      .update({
        status: "failed",
        error: "Could not queue refresh. Retry from verification.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
  }
  return data.id as string;
}
