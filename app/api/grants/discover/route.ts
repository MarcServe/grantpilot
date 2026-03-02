import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import {
  runDiscoveryAndUpsert,
  profileToDiscoveryProfile,
} from "@/lib/grants-discovery";

/**
 * POST /api/grants/discover
 * Run OpenAI + Gemini discovery for the current org's profile and upsert new grants.
 * Requires auth.
 */
export async function POST(): Promise<NextResponse> {
  try {
    const { org, orgId } = await getActiveOrg();
    const profile = org.profiles?.[0];
    if (!profile) {
      return NextResponse.json(
        { error: "Complete your business profile first (at least 30% completion)" },
        { status: 400 }
      );
    }

    const completionScore = profile.completionScore ?? 0;
    if (completionScore < 30) {
      return NextResponse.json(
        { error: "Complete your business profile at least 30% to run discovery" },
        { status: 400 }
      );
    }

    const discoveryProfile = profileToDiscoveryProfile({
      businessName: profile.businessName,
      sector: profile.sector,
      description: profile.description,
      location: profile.location,
      fundingMin: profile.fundingMin,
      fundingMax: profile.fundingMax,
      fundingPurposes: profile.fundingPurposes,
      funderLocations: (profile as { funderLocations?: string[] }).funderLocations,
    });

    const result = await runDiscoveryAndUpsert(discoveryProfile);

    return NextResponse.json({
      ok: true,
      claude: result.claude,
      openai: result.openai,
      gemini: result.gemini,
      created: result.created,
      updated: result.updated,
    });
  } catch (e) {
    console.error("[grants/discover]", e);
    return NextResponse.json(
      { error: "Discovery failed" },
      { status: 500 }
    );
  }
}
