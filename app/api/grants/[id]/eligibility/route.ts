import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getEligibilityDecision } from "@/lib/claude";

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
    fundingMin: Number(get("fundingMin") ?? get("funding_min") ?? 0),
    fundingMax: Number(get("fundingMax") ?? get("funding_max") ?? 0),
    fundingPurposes: Array.isArray(profile.fundingPurposes) ? profile.fundingPurposes as string[] : (Array.isArray(profile.funding_purposes) ? profile.funding_purposes as string[] : []),
    fundingDetails: profile.fundingDetails != null ? String(profile.fundingDetails) : (profile.funding_details != null ? String(profile.funding_details) : null),
  };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { org, orgId } = await getActiveOrg();
    const profile = org.profiles?.[0];
    if (!profile || (profile.completionScore ?? 0) < 50) {
      return NextResponse.json(
        { error: "Complete at least 50% of your profile to get eligibility assessment." },
        { status: 400 }
      );
    }

    const { id: grantId } = await params;
    const url = new URL(req.url);
    const useCache = url.searchParams.get("skipCache") !== "true";
    const supabase = getSupabaseAdmin();

    const { data: grant, error: grantError } = await supabase
      .from("Grant")
      .select("id, name, funder, amount, eligibility, sectors, regions")
      .eq("id", grantId)
      .single();

    if (grantError || !grant) {
      return NextResponse.json({ error: "Grant not found" }, { status: 404 });
    }

    const g = grant as {
      id: string;
      name: string;
      funder: string;
      amount: number | null;
      eligibility: string;
      sectors: string[];
      regions: string[];
    };

    if (useCache) {
      const { data: cached } = await supabase
        .from("EligibilityAssessment")
        .select("score, decision, summary, reasons, alignment, improvement_plan")
        .eq("organisation_id", orgId)
        .eq("profile_id", profile.id)
        .eq("grant_id", grantId)
        .maybeSingle();
      if (cached) {
        const c = cached as { score: number; decision: string; summary: string | null; reasons: unknown; alignment: unknown; improvement_plan: unknown };
        return NextResponse.json({
          decision: c.decision,
          reason: c.summary ?? "",
          confidence: c.score,
          score: c.score,
          summary: c.summary ?? undefined,
          reasons: (c.reasons as string[]) ?? [],
          alignment: (c.alignment as string[]) ?? undefined,
          improvementPlan: c.improvement_plan ?? undefined,
        });
      }
    }

    const result = await getEligibilityDecision(
      profileToMatching(profile as Record<string, unknown>),
      {
        id: g.id,
        name: g.name,
        funder: g.funder,
        amount: g.amount,
        eligibility: g.eligibility,
        sectors: g.sectors ?? [],
        regions: g.regions ?? [],
      }
    );

    const score = result.score ?? result.confidence;
    await supabase.from("EligibilityAssessment").upsert(
      {
        organisation_id: orgId,
        profile_id: profile.id,
        grant_id: grantId,
        score,
        decision: result.decision,
        summary: result.summary ?? result.reason,
        reasons: result.reasons ?? [],
        alignment: result.alignment ?? null,
        improvement_plan: result.improvementPlan ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organisation_id,profile_id,grant_id" }
    );

    return NextResponse.json(result);
  } catch (e) {
    console.error("[GRANTS_ELIGIBILITY]", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
