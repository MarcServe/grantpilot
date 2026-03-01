import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getEligibilityDecision } from "@/lib/claude";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { org } = await getActiveOrg();
    const profile = org.profiles?.[0];
    if (!profile || (profile.completionScore ?? 0) < 50) {
      return NextResponse.json(
        { error: "Complete at least 50% of your profile to get eligibility assessment." },
        { status: 400 }
      );
    }

    const { id: grantId } = await params;
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

    const p = profile as Record<string, unknown>;
    const get = (key: string) => p[key] ?? p[key.replace(/([A-Z])/g, "_$1").toLowerCase()];
    const result = await getEligibilityDecision(
      {
        businessName: String(get("businessName") ?? ""),
        sector: String(get("sector") ?? ""),
        missionStatement: String(get("missionStatement") ?? ""),
        description: String(get("description") ?? ""),
        location: String(get("location") ?? ""),
        employeeCount: p.employeeCount != null ? Number(p.employeeCount) : (p.employee_count != null ? Number(p.employee_count) : null),
        annualRevenue: p.annualRevenue != null ? Number(p.annualRevenue) : (p.annual_revenue != null ? Number(p.annual_revenue) : null),
        fundingMin: Number(get("fundingMin") ?? get("funding_min") ?? 0),
        fundingMax: Number(get("fundingMax") ?? get("funding_max") ?? 0),
        fundingPurposes: Array.isArray(p.fundingPurposes) ? p.fundingPurposes as string[] : (Array.isArray(p.funding_purposes) ? p.funding_purposes as string[] : []),
        fundingDetails: p.fundingDetails != null ? String(p.fundingDetails) : (p.funding_details != null ? String(p.funding_details) : null),
      },
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

    return NextResponse.json(result);
  } catch (e) {
    console.error("[GRANTS_ELIGIBILITY]", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
