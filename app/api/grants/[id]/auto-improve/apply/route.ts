import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * POST /api/grants/[id]/auto-improve/apply
 * Applies suggested profile text to the current business profile.
 * Body: { missionStatement?: string; description?: string; fundingDetails?: string }
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
    const update: Record<string, string | null> = {};
    if (typeof body.missionStatement === "string") update.missionStatement = body.missionStatement;
    if (typeof body.description === "string") update.description = body.description;
    if (body.fundingDetails !== undefined) update.fundingDetails = body.fundingDetails == null ? null : String(body.fundingDetails);

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No valid fields to apply" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("BusinessProfile")
      .update(update)
      .eq("id", profile.id)
      .eq("organisationId", orgId);

    if (error) {
      console.error("[AUTO_IMPROVE_APPLY]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[AUTO_IMPROVE_APPLY]", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
