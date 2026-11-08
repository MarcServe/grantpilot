import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { analyseWebsite } from "@/lib/website-intelligence";
import { planAllowsForOrg, PLAN_CAPABILITY_MESSAGES } from "@/lib/plan-features";
export const maxDuration = 120;
export async function POST(request: Request) {
  try {
    const { orgId, org, profile: activeProfile } = await getActiveOrg();
    if (!planAllowsForOrg(org, "website_intelligence_refresh")) return NextResponse.json({ error: PLAN_CAPABILITY_MESSAGES.website_intelligence_refresh, code: "FEATURE_FORBIDDEN" }, { status: 402 });
    if (!activeProfile?.id) return NextResponse.json({ error: "Profile not found" }, { status: 400 });
    const body = await request.json().catch(() => ({}));
    if (body.profileId && body.profileId !== activeProfile.id) return NextResponse.json({ error: "The active business changed. Reload the profile before refreshing." }, { status: 409 });
    const db = getSupabaseAdmin();
    const { data: profile, error } = await db.from("BusinessProfile").select("id, websiteUrl").eq("id", activeProfile.id).eq("organisationId", orgId).maybeSingle();
    if (error || !profile?.websiteUrl) return NextResponse.json({ error: "Save your company website in Business Basics first." }, { status: 400 });
    if (body.websiteUrl && body.websiteUrl !== profile.websiteUrl) return NextResponse.json({ error: "Save the changed website URL before refreshing it." }, { status: 409 });
    const intelligence = await analyseWebsite(profile.websiteUrl);
    const saved = await db.from("BusinessProfile").update({ websiteIntelligence: intelligence }).eq("id", profile.id).eq("organisationId", orgId).eq("websiteUrl", profile.websiteUrl).select("id").maybeSingle();
    if (saved.error) return NextResponse.json({ error: "The website was read but the updated context could not be saved. Please retry." }, { status: 502 });
    if (!saved.data) return NextResponse.json({ error: "The website URL changed during the refresh. Retry using the latest saved URL." }, { status: 409 });
    return NextResponse.json({ ok: true, profileId: profile.id, websiteUrl: profile.websiteUrl, summary: intelligence, chars: intelligence.length, refreshedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not refresh the website. Check that the saved HTTPS address is public and readable, then retry. Your previous website context has been kept." }, { status: 502 });
  }
}
