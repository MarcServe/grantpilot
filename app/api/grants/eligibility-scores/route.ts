import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getApplicantTypeGate } from "@/lib/eligibility-hard-gates";
import { getAppliedGrantIds } from "@/lib/applied-grants";
import { getGrantFreshnessStatus } from "@/lib/grant-freshness";

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
      .select("grant_id, score, summary, reasons, alignment, improvement_plan, met_criteria, missing_criteria, scoring_source")
      .eq("organisation_id", orgId)
      .eq("profile_id", profile.id);

    const grantIds = (rows ?? []).map((row: { grant_id: string }) => row.grant_id);
    const { data: grants = [] } = grantIds.length > 0
      ? await supabase
          .from("Grant")
          .select("id, deadline, url_status, eligibility, description, objectives, applicantTypes")
          .in("id", grantIds)
      : { data: [] };
    const grantsById = new Map(
      (grants as { id: string; deadline?: string | null; url_status?: string | null; eligibility?: string | null; description?: string | null; objectives?: string | null; applicantTypes?: string[] | null }[]).map((grant) => [grant.id, grant])
    );
    const profileBusinessType = String(
      (profile as Record<string, unknown>).businessType ?? (profile as Record<string, unknown>).business_type ?? ""
    );

    const scores: Record<
      string,
      { score: number; summary?: string; reasons?: string[]; alignment?: string[]; improvementPlan?: unknown; met?: string[]; missing?: string[]; scoringSource?: string }
    > = {};
    for (const row of rows as { grant_id: string; score: number; summary: string | null; reasons: unknown; alignment: unknown; improvement_plan: unknown; met_criteria: unknown; missing_criteria: unknown; scoring_source?: string | null }[]) {
      if (appliedGrantIds.has(row.grant_id)) continue;
      const grant = grantsById.get(row.grant_id);
      if (grant && !getGrantFreshnessStatus(grant).usable) continue;
      const applicantGate = getApplicantTypeGate(profileBusinessType, grant ?? {});
      const source = row.scoring_source ?? (row.summary?.startsWith("Preliminary fit") ? "heuristic" : "openai");
      const sourceCappedScore = source === "heuristic" ? Math.min(row.score, 69) : row.score;
      const score = applicantGate && !applicantGate.profileMatches ? Math.min(sourceCappedScore, 25) : sourceCappedScore;
      scores[row.grant_id] = {
        score,
        summary: source === "heuristic"
          ? row.summary ?? "Preliminary fit only. Open the grant to run full company-DNA reasoning."
          : row.summary ?? undefined,
        reasons: (row.reasons as string[]) ?? undefined,
        alignment: (row.alignment as string[]) ?? undefined,
        improvementPlan: row.improvement_plan ?? undefined,
        met: (row.met_criteria as string[]) ?? undefined,
        missing: (row.missing_criteria as string[]) ?? undefined,
        scoringSource: source,
      };
    }

    return NextResponse.json({ scores });
  } catch (e) {
    console.error("[ELIGIBILITY_SCORES]", e);
    return NextResponse.json({ scores: {} });
  }
}
