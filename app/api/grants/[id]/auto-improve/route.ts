import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { suggestProfileImprovements } from "@/lib/claude";

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
    fundingPurposes: Array.isArray(profile.fundingPurposes) ? (profile.fundingPurposes as string[]) : (Array.isArray(profile.funding_purposes) ? (profile.funding_purposes as string[]) : []),
    fundingDetails: profile.fundingDetails != null ? String(profile.fundingDetails) : (profile.funding_details != null ? String(profile.funding_details) : null),
  };
}

/**
 * POST /api/grants/[id]/auto-improve
 * Returns AI-suggested rewrites for profile sections to improve eligibility for this grant.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { org, orgId } = await getActiveOrg();
    const profile = org.profiles?.[0];
    if (!profile || (profile.completionScore ?? 0) < 50) {
      return NextResponse.json(
        { error: "Complete your profile first to use auto-improve." },
        { status: 400 }
      );
    }

    const { id: grantId } = await params;
    const supabase = getSupabaseAdmin();

    const { data: grant, error: grantError } = await supabase
      .from("Grant")
      .select("id, name, funder, amount, eligibility, description, objectives, applicantTypes, sectors, regions")
      .eq("id", grantId)
      .single();

    if (grantError || !grant) {
      return NextResponse.json({ error: "Grant not found" }, { status: 404 });
    }

    const { data: assessment } = await supabase
      .from("EligibilityAssessment")
      .select("summary, reasons, improvement_plan, missing_criteria")
      .eq("organisation_id", orgId)
      .eq("profile_id", profile.id)
      .eq("grant_id", grantId)
      .maybeSingle();

    const eligibilityContext = {
      missing: (assessment?.missing_criteria as string[]) ?? [],
      improvementPlan: assessment?.improvement_plan as { gaps?: string[]; actions?: string[]; timeline?: string } | undefined,
      summary: (assessment as { summary?: string })?.summary,
    };

    const profileForMatching = profileToMatching(profile as Record<string, unknown>);
    const grantForMatching = {
      id: (grant as { id: string }).id,
      name: (grant as { name: string }).name,
      funder: (grant as { funder: string }).funder,
      amount: (grant as { amount: number | null }).amount ?? null,
      eligibility: (grant as { eligibility: string }).eligibility,
      description: (grant as { description?: string })?.description ?? null,
      objectives: (grant as { objectives?: string })?.objectives ?? null,
      applicantTypes: (grant as { applicantTypes?: string[] })?.applicantTypes ?? [],
      sectors: (grant as { sectors: string[] }).sectors ?? [],
      regions: (grant as { regions: string[] }).regions ?? [],
    };

    const suggestions = await suggestProfileImprovements(
      profileForMatching,
      grantForMatching,
      eligibilityContext
    );

    return NextResponse.json({ suggestions });
  } catch (e) {
    console.error("[AUTO_IMPROVE]", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
