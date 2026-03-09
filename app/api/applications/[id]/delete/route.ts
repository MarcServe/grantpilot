import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * DELETE /api/applications/[id]/delete
 * Permanently remove an application from the user's list (dashboard and applications page).
 * Cleans up related ApplicationTask and cu_sessions/cu_session_items/cu_session_logs.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { orgId } = await getActiveOrg();
    const { id: applicationId } = await params;
    const supabase = getSupabaseAdmin();

    let { data: application } = await supabase
      .from("Application")
      .select("id")
      .eq("id", applicationId)
      .eq("organisationId", orgId)
      .maybeSingle();

    if (!application) {
      const alt = await supabase
        .from("Application")
        .select("id")
        .eq("id", applicationId)
        .eq("organisation_id", orgId)
        .maybeSingle();
      application = alt.data ?? null;
    }

    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    const publicId = `grantapp_${applicationId}`;

    const { data: session } = await supabase
      .from("cu_sessions")
      .select("id")
      .eq("public_id", publicId)
      .maybeSingle();

    if (session) {
      const sessionId = (session as { id: number }).id;
      await supabase.from("cu_session_logs").delete().eq("session_id", sessionId);
      await supabase.from("cu_session_items").delete().eq("session_id", sessionId);
      await supabase.from("cu_sessions").delete().eq("id", sessionId);
    }

    await supabase.from("ApplicationTask").delete().eq("applicationId", applicationId);
    await supabase.from("Application").delete().eq("id", applicationId);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[APPLICATION_DELETE]", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
