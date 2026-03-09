import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveOrg } from "@/lib/auth";
import { matchGrantsToProfile } from "@/lib/claude";
import { grantMatchesFunderLocations } from "@/lib/constants";

function scoreToDecision(score: number): "likely_eligible" | "review" | "unlikely" {
  if (score >= 70) return "likely_eligible";
  if (score >= 40) return "review";
  return "unlikely";
}

export async function POST(): Promise<NextResponse> {
  try {
    const { org, orgId } = await getActiveOrg();

    const profile = org.profiles?.[0];
    if (!profile || (profile.completionScore ?? 0) < 50) {
      return NextResponse.json(
        { error: "Please complete at least 50% of your business profile before matching grants." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from("Grant").select("*");
    const allGrants = data ?? [];
    const userFunderLocations = (profile as { funderLocations?: string[] }).funderLocations;
    const grants = allGrants.filter((g: { funderLocations?: string[] }) =>
      grantMatchesFunderLocations(g.funderLocations, userFunderLocations)
    );

    const matches = await matchGrantsToProfile(
      {
        businessName: profile.businessName,
        sector: profile.sector,
        missionStatement: profile.missionStatement,
        description: profile.description,
        location: profile.location,
        employeeCount: profile.employeeCount,
        annualRevenue: profile.annualRevenue,
        fundingMin: profile.fundingMin,
        fundingMax: profile.fundingMax,
        fundingPurposes: profile.fundingPurposes,
        fundingDetails: profile.fundingDetails,
      },
      grants.map((g: { id: string; name: string; funder: string; amount?: number; eligibility: string; description?: string; objectives?: string; applicantTypes?: string[]; sectors: string[]; regions: string[] }) => ({
        id: g.id,
        name: g.name,
        funder: g.funder,
        amount: g.amount ?? null,
        eligibility: g.eligibility,
        description: g.description ?? null,
        objectives: g.objectives ?? null,
        applicantTypes: g.applicantTypes ?? [],
        sectors: g.sectors,
        regions: g.regions,
      }))
    );

    for (const m of matches) {
      await supabase.from("EligibilityAssessment").upsert(
        {
          organisation_id: orgId,
          profile_id: profile.id,
          grant_id: m.grantId,
          score: m.score,
          decision: scoreToDecision(m.score),
          summary: m.reason ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organisation_id,profile_id,grant_id" }
      );
    }

    return NextResponse.json({ matches });
  } catch (error) {
    console.error("[GRANTS_MATCH]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
