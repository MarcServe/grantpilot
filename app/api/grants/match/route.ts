import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveOrg } from "@/lib/auth";
import { matchGrantsToProfile } from "@/lib/claude";

export async function POST(): Promise<NextResponse> {
  try {
    const { org } = await getActiveOrg();

    const profile = org.profiles[0];
    if (!profile || profile.completionScore < 50) {
      return NextResponse.json(
        { error: "Please complete at least 50% of your business profile before matching grants." },
        { status: 400 }
      );
    }

    const grants = await prisma.grant.findMany();

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
      grants.map((g) => ({
        id: g.id,
        name: g.name,
        funder: g.funder,
        amount: g.amount,
        eligibility: g.eligibility,
        sectors: g.sectors,
        regions: g.regions,
      }))
    );

    return NextResponse.json({ matches });
  } catch (error) {
    console.error("[GRANTS_MATCH]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
