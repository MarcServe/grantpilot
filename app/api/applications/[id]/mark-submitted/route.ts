import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { markGrantUserState } from "@/lib/grant-user-state";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { org, orgId } = await getActiveOrg();
    const profile = org.profiles?.[0];
    const { id } = await params;
    const supabase = getSupabaseAdmin();

    const { data: app, error } = await supabase
      .from("Application")
      .select("id, grantId, profileId")
      .eq("id", id)
      .eq("organisationId", orgId)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!app) return NextResponse.json({ error: "Application not found" }, { status: 404 });

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("Application")
      .update({ status: "SUBMITTED", submittedAt: now, updatedAt: now })
      .eq("id", id)
      .eq("organisationId", orgId);

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    const row = app as { grantId?: string | null; profileId?: string | null };
    if (row.grantId && (row.profileId || profile?.id)) {
      await markGrantUserState(supabase, {
        organisationId: orgId,
        profileId: row.profileId ?? profile!.id,
        grantId: row.grantId,
        status: "applied",
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Request failed" },
      { status: 500 }
    );
  }
}
