import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * GET /api/grants/eligibility-scores
 * Returns cached eligibility assessments for the current org (keyed by grantId).
 * Used by grants list and dashboard to show scores without per-grant clicks.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const { org, orgId } = await getActiveOrg();
    const profile = org.profiles?.[0];
    if (!profile || (profile.completionScore ?? 0) < 50) {
      return NextResponse.json({ scores: {} });
    }

    const supabase = getSupabaseAdmin();
    const { data: rows = [] } = await supabase
      .from("EligibilityAssessment")
      .select("grant_id, score, summary, reasons, alignment, improvement_plan")
      .eq("organisation_id", orgId)
      .eq("profile_id", profile.id);

    const scores: Record<
      string,
      { score: number; summary?: string; reasons?: string[]; alignment?: string[]; improvementPlan?: unknown }
    > = {};
    for (const row of rows as { grant_id: string; score: number; summary: string | null; reasons: unknown; alignment: unknown; improvement_plan: unknown }[]) {
      scores[row.grant_id] = {
        score: row.score,
        summary: row.summary ?? undefined,
        reasons: (row.reasons as string[]) ?? undefined,
        alignment: (row.alignment as string[]) ?? undefined,
        improvementPlan: row.improvement_plan ?? undefined,
      };
    }

    return NextResponse.json({ scores });
  } catch (e) {
    console.error("[ELIGIBILITY_SCORES]", e);
    return NextResponse.json({ scores: {} });
  }
}
