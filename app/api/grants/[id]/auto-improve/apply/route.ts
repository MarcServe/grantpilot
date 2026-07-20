import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { planAllowsForOrg, PLAN_CAPABILITY_MESSAGES } from "@/lib/plan-features";

/**
 * POST /api/grants/[id]/auto-improve/apply
 * Applies suggested profile text.
 * Body: { missionStatement?, description?, fundingDetails?, applyToApplicationOnly?: boolean, applicationId?: string }
 * If applyToApplicationOnly is set, writes to Application.profile_overrides for that application only,
 * or to EligibilityAssessment.profile_overrides until an application is started.
 * Otherwise updates the current business profile.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { org, orgId } = await getActiveOrg();
    if (!planAllowsForOrg(org, "grant_auto_improve")) {
      return NextResponse.json(
        { error: PLAN_CAPABILITY_MESSAGES.grant_auto_improve, code: "FEATURE_FORBIDDEN" },
        { status: 402 }
      );
    }

    const profile = org.profiles?.[0];
    if (!profile) {
      return NextResponse.json({ error: "No profile found" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const applyToApplicationOnly = body.applyToApplicationOnly === true;
    const applicationId = body.applicationId as string | undefined;

    const overrides: Record<string, string | null> = {};
    if (typeof body.missionStatement === "string") overrides.missionStatement = body.missionStatement;
    if (typeof body.description === "string") overrides.description = body.description;
    if (body.fundingDetails !== undefined) overrides.fundingDetails = body.fundingDetails == null ? null : String(body.fundingDetails);

    if (Object.keys(overrides).length === 0) {
      return NextResponse.json({ error: "No valid fields to apply" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { id: grantId } = await params;

    if (applyToApplicationOnly) {
      if (!applicationId) {
        const { data: existingAssessment } = await supabase
          .from("EligibilityAssessment")
          .select("id, profile_overrides")
          .eq("organisation_id", orgId)
          .eq("profile_id", profile.id)
          .eq("grant_id", grantId)
          .maybeSingle();

        const existing =
          (existingAssessment as { profile_overrides?: Record<string, string | null> } | null)?.profile_overrides ?? {};
        const merged = { ...existing, ...overrides };

        const existingId = (existingAssessment as { id?: string } | null)?.id;
        const write = existingId
          ? await supabase
              .from("EligibilityAssessment")
              .update({ profile_overrides: merged, updated_at: new Date().toISOString() })
              .eq("id", existingId)
          : await supabase.from("EligibilityAssessment").insert({
              organisation_id: orgId,
              profile_id: profile.id,
              grant_id: grantId,
              score: 0,
              decision: "review",
              summary: "Grant-specific profile improvement draft saved. Run a fresh company-DNA check for scoring.",
              reasons: [],
              profile_overrides: merged,
              scoring_source: "manual",
              updated_at: new Date().toISOString(),
            });

        if (write.error) {
          console.error("[AUTO_IMPROVE_APPLY]", write.error);
          return NextResponse.json({ error: write.error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, appliedTo: "grant" });
      }

      let app = await supabase
        .from("Application")
        .select("id, profile_overrides")
        .eq("id", applicationId)
        .eq("organisationId", orgId)
        .eq("grantId", grantId)
        .maybeSingle();

      if (!app.data) {
        const alt = await supabase
          .from("Application")
          .select("id, profile_overrides")
          .eq("id", applicationId)
          .eq("organisation_id", orgId)
          .eq("grantId", grantId)
          .maybeSingle();
        app = alt;
      }

      if (!app.data) {
        return NextResponse.json({ error: "Application not found or does not match this grant." }, { status: 404 });
      }

      const existing = (app.data as { profile_overrides?: Record<string, string | null> }).profile_overrides ?? {};
      const merged = { ...existing, ...overrides };

      const { error } = await supabase
        .from("Application")
        .update({ profile_overrides: merged })
        .eq("id", applicationId);

      if (error) {
        console.error("[AUTO_IMPROVE_APPLY]", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, appliedTo: "application" });
    }

    const update: Record<string, string | null> = { ...overrides };
    const { error } = await supabase
      .from("BusinessProfile")
      .update(update)
      .eq("id", profile.id)
      .eq("organisationId", orgId);

    if (error) {
      console.error("[AUTO_IMPROVE_APPLY]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, appliedTo: "profile" });
  } catch (e) {
    console.error("[AUTO_IMPROVE_APPLY]", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
