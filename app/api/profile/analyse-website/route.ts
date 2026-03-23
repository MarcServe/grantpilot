import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { analyseWebsite } from "@/lib/website-intelligence";

export async function POST() {
  const { orgId } = await getActiveOrg();
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
