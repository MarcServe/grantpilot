import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { planAllowsForOrg, PLAN_CAPABILITY_MESSAGES } from "@/lib/plan-features";
import { getMatchHealthReport } from "@/lib/match-health";
import { suggestBusinessDnaCoverageImprovements } from "@/lib/claude";

async function getProfileForOrg(orgId: string, profileId: string): Promise<Record<string, unknown> | null> {
  const { data } = await getSupabaseAdmin()
    .from("BusinessProfile")
    .select("*")
    .eq("id", profileId)
    .eq("organisationId", orgId)
    .maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

export async function POST(): Promise<NextResponse> {
  try {
    const { orgId, org, profile: activeProfile } = await getActiveOrg();
    if (!planAllowsForOrg(org, "company_dna_ai")) {
      return NextResponse.json(
        { error: PLAN_CAPABILITY_MESSAGES.company_dna_ai, code: "FEATURE_FORBIDDEN" },
        { status: 402 }
      );
    }
    if (!activeProfile?.id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const supabase = getSupabaseAdmin();
    const profile = await getProfileForOrg(orgId, activeProfile.id);
    if (!profile?.id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const report = await getMatchHealthReport({
      supabase,
      orgId,
      profile: profile as Record<string, unknown> & { id: string },
    });
    const suggestions = await suggestBusinessDnaCoverageImprovements(profile, report);

    return NextResponse.json({ suggestions, report });
  } catch (error) {
    console.error("[PROFILE_MATCH_HEALTH_IMPROVE]", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
