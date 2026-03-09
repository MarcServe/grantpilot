import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { mergeGrantMemoryFromSnapshot } from "@/lib/grant-memory";

/**
 * POST /api/applications/[id]/save-to-profile
 * Merges this application's filled_snapshot into the profile's GrantMemory
 * so the answers are used for future applications.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { orgId } = await getActiveOrg();
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Application ID required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: app, error } = await supabase
      .from("Application")
      .select("id, profile_id, organisation_id, filled_snapshot")
      .eq("id", id)
      .eq("organisation_id", orgId)
      .single();

    if (error || !app) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    const row = app as { profile_id?: string; organisation_id?: string; filled_snapshot?: unknown };
    const profileId = row.profile_id;
    const organisationId = row.organisation_id ?? orgId;
    const filledSnapshot = row.filled_snapshot;

    if (!profileId) {
      return NextResponse.json({ error: "Application has no profile" }, { status: 400 });
    }
    if (!filledSnapshot || typeof filledSnapshot !== "object") {
      return NextResponse.json(
        { error: "No filled data to save. Complete the form fill first." },
        { status: 400 }
      );
    }

    await mergeGrantMemoryFromSnapshot(profileId, organisationId, filledSnapshot);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[SAVE_TO_PROFILE]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save" },
      { status: 500 }
    );
  }
}
