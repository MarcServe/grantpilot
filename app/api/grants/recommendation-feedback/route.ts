import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

const FEEDBACK_CATEGORIES = [
  "relevant",
  "not_relevant",
  "expired",
  "wrong_location",
  "not_my_business_type",
  "already_applied",
] as const;

const feedbackSchema = z.object({
  grantId: z.string().min(1),
  profileId: z.string().min(1).optional(),
  category: z.enum(FEEDBACK_CATEGORIES),
  note: z.string().max(1000).optional(),
  source: z.string().max(80).optional(),
});

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { user, orgId, org, activeProfileId } = await getActiveOrg();
    const parsed = feedbackSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid recommendation feedback" }, { status: 400 });
    }

    const profileId = parsed.data.profileId ?? activeProfileId ?? org.profiles?.[0]?.id;
    if (!profileId) {
      return NextResponse.json({ error: "Complete your business profile first." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: profile } = await supabase
      .from("BusinessProfile")
      .select("id")
      .eq("id", profileId)
      .eq("organisationId", orgId)
      .maybeSingle();

    if (!profile?.id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const { data: grant } = await supabase
      .from("Grant")
      .select("id")
      .eq("id", parsed.data.grantId)
      .maybeSingle();

    if (!grant?.id) {
      return NextResponse.json({ error: "Grant not found" }, { status: 404 });
    }

    const { error } = await supabase.from("RecommendationFeedback").insert({
      organisation_id: orgId,
      profile_id: profile.id,
      grant_id: grant.id,
      user_id: user.id,
      category: parsed.data.category,
      note: parsed.data.note?.trim() || null,
      source: parsed.data.source?.trim() || "grant_card",
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[RECOMMENDATION_FEEDBACK]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
