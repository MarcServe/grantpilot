import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getApplicantTypeGate } from "@/lib/eligibility-hard-gates";
import { getAppliedGrantIds } from "@/lib/applied-grants";

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
    const appliedGrantIds = await getAppliedGrantIds(supabase, orgId, profile.id);
    const { data: rows = [] } = await supabase
      .from("EligibilityAssessment")
      .select("grant_id, score, summary, reasons, alignment, improvement_plan, met_criteria, missing_criteria")
      .eq("organisation_id", orgId)
      .eq("profile_id", profile.id);

    const grantIds = (rows ?? []).map((row: { grant_id: string }) => row.grant_id);
    const { data: grants = [] } = grantIds.length > 0
      ? await supabase
          .from("Grant")
          .select("id, eligibility, applicantTypes")
          .in("id", grantIds)
      : { data: [] };
    const grantsById = new Map(
      (grants as { id: string; eligibility?: string | null; applicantTypes?: string[] | null }[]).map((grant) => [grant.id, grant])
    );
    const profileBusinessType = String(
      (profile as Record<string, unknown>).businessType ?? (profile as Record<string, unknown>).business_type ?? ""
    );

    const scores: Record<
      string,
      { score: number; summary?: string; reasons?: string[]; alignment?: string[]; improvementPlan?: unknown; met?: string[]; missing?: string[] }
    > = {};
    for (const row of rows as { grant_id: string; score: number; summary: string | null; reasons: unknown; alignment: unknown; improvement_plan: unknown; met_criteria: unknown; missing_criteria: unknown }[]) {
      if (appliedGrantIds.has(row.grant_id)) continue;
      const applicantGate = getApplicantTypeGate(profileBusinessType, grantsById.get(row.grant_id) ?? {});
      const score = applicantGate && !applicantGate.profileMatches ? Math.min(row.score, 25) : row.score;
      scores[row.grant_id] = {
        score,
        summary: row.summary ?? undefined,
        reasons: (row.reasons as string[]) ?? undefined,
        alignment: (row.alignment as string[]) ?? undefined,
        improvementPlan: row.improvement_plan ?? undefined,
        met: (row.met_criteria as string[]) ?? undefined,
        missing: (row.missing_criteria as string[]) ?? undefined,
      };
    }

    return NextResponse.json({ scores });
  } catch (e) {
    console.error("[ELIGIBILITY_SCORES]", e);
    return NextResponse.json({ scores: {} });
  }
}
