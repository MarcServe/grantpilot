import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { eligibilityPreferencesSchema } from "@/lib/validations/eligibility-preferences";

/**
 * GET /api/profile/eligibility-preferences
 * Returns the current org's eligibility notification preferences.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const { orgId } = await getActiveOrg();
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("EligibilityNotificationPreference")
      .select("min_score, max_score, eligible_threshold, notify_email, notify_in_app, notify_whatsapp")
      .eq("organisation_id", orgId)
      .maybeSingle();

    if (error) {
      console.error("[ELIGIBILITY_PREFS] GET", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({
        minScore: 70,
        maxScore: 100,
        eligibleThreshold: 70,
        notifyEmail: true,
        notifyInApp: true,
        notifyWhatsApp: false,
      });
    }

    const row = data as { min_score: number; max_score: number; eligible_threshold?: number; notify_email: boolean; notify_in_app: boolean; notify_whatsapp?: boolean };
    return NextResponse.json({
      minScore: row.min_score,
      maxScore: row.max_score,
      eligibleThreshold: row.eligible_threshold ?? 70,
      notifyEmail: row.notify_email,
      notifyInApp: row.notify_in_app,
      notifyWhatsApp: row.notify_whatsapp ?? false,
    });
  } catch (e) {
    console.error("[ELIGIBILITY_PREFS]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PUT /api/profile/eligibility-preferences
 * Upserts the current org's eligibility notification preferences.
 */
export async function PUT(req: Request): Promise<NextResponse> {
  try {
    const { orgId } = await getActiveOrg();
    const body = await req.json();
    const parsed = eligibilityPreferencesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("EligibilityNotificationPreference")
      .upsert(
        {
          organisation_id: orgId,
          min_score: parsed.data.minScore,
          max_score: parsed.data.maxScore,
          eligible_threshold: parsed.data.eligibleThreshold ?? 70,
          notify_email: parsed.data.notifyEmail,
          notify_in_app: parsed.data.notifyInApp,
          notify_whatsapp: parsed.data.notifyWhatsApp ?? false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organisation_id" }
      );

    if (error) {
      console.error("[ELIGIBILITY_PREFS] PUT", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[ELIGIBILITY_PREFS]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
