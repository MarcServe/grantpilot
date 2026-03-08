import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

const STOPPABLE_STATUSES = ["PENDING", "FILLING", "REVIEW_REQUIRED"];

/**
 * POST /api/applications/[id]/cancel
 * Stop a pending/filling/review application. Sets Application to FAILED and marks the session failed so the worker skips it.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { orgId } = await getActiveOrg();
    const { id: applicationId } = await params;
    const supabase = getSupabaseAdmin();

    let { data: application, error: appErr } = await supabase
      .from("Application")
      .select("id, status")
      .eq("id", applicationId)
      .eq("organisationId", orgId)
      .maybeSingle();

    if ((appErr || !application) && orgId) {
      const alt = await supabase
        .from("Application")
        .select("id, status")
        .eq("id", applicationId)
        .eq("organisation_id", orgId)
        .maybeSingle();
      application = alt.data ?? null;
      appErr = alt.error;
    }

    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    const status = (application as { status: string }).status;
    if (!STOPPABLE_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: "Application can only be stopped when it is pending, filling, or awaiting review." },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    await supabase
      .from("Application")
      .update({ status: "FAILED", updatedAt: now, stopped_at: now })
      .eq("id", applicationId);

    const publicId = `grantapp_${applicationId}`;
    await supabase
      .from("cu_sessions")
      .update({
        status: "failed",
        error_log: "Stopped by user",
        updated_at: now,
      })
      .eq("public_id", publicId);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[APPLICATION_CANCEL]", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
