import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * POST /api/grants/[id]/auto-improve/apply
 * Applies suggested profile text.
 * Body: { missionStatement?, description?, fundingDetails?, applyToApplicationOnly?: boolean, applicationId?: string }
 * If applyToApplicationOnly and applicationId are set, writes to Application.profile_overrides for that application only.
 * Otherwise updates the current business profile.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { org, orgId } = await getActiveOrg();
    const profile = org.profiles?.[0];
    if (!profile) {
      return NextResponse.json({ error: "No profile found" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const applyToApplicationOnly = body.applyToApplicationOnly === true && typeof body.applicationId === "string";
    const applicationId = body.applicationId as string | undefined;

    const overrides: Record<string, string | null> = {};
    if (typeof body.missionStatement === "string") overrides.missionStatement = body.missionStatement;
    if (typeof body.description === "string") overrides.description = body.description;
    if (body.fundingDetails !== undefined) overrides.fundingDetails = body.fundingDetails == null ? null : String(body.fundingDetails);

    if (Object.keys(overrides).length === 0) {
      return NextResponse.json({ error: "No valid fields to apply" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    if (applyToApplicationOnly && applicationId) {
      const { id: grantId } = await params;
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
