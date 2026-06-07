import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { analyseWebsite } from "@/lib/website-intelligence";
import { planAllowsForOrg, PLAN_CAPABILITY_MESSAGES } from "@/lib/plan-features";

export async function POST() {
  const { orgId, org } = await getActiveOrg();
  if (!planAllowsForOrg(org as { plan?: string; createdAt?: string | Date | null }, "website_intelligence_refresh")) {
    return NextResponse.json(
      { error: PLAN_CAPABILITY_MESSAGES.website_intelligence_refresh, code: "FEATURE_FORBIDDEN" },
      { status: 402 }
    );
  }

  const supabase = getSupabaseAdmin();

  const { data: profile } = await supabase
    .from("BusinessProfile")
    .select("id, websiteUrl")
    .eq("organisationId", orgId)
    .maybeSingle();

  if (!profile?.websiteUrl) {
    return NextResponse.json(
      { error: "No website URL set on your profile" },
      { status: 400 }
    );
  }

  try {
    const intelligence = await analyseWebsite(profile.websiteUrl);
    await supabase
      .from("BusinessProfile")
      .update({ websiteIntelligence: intelligence })
      .eq("id", profile.id);

    return NextResponse.json({ ok: true, chars: intelligence.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Analysis failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
