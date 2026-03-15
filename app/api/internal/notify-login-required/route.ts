import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { notifyOrgMembers } from "@/lib/notify";

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;

/**
 * POST /api/internal/notify-login-required
 * Called by the worker when it detects login_required or needs_verification.
 * Sends one notification per application (idempotent via login_required_notified_at).
 * Body: { applicationId: string }
 */
export async function POST(req: Request): Promise<NextResponse> {
  const secret = req.headers.get("x-internal-secret");
  if (!INTERNAL_SECRET || secret !== INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { applicationId } = body;
    if (!applicationId || typeof applicationId !== "string") {
      return NextResponse.json({ error: "applicationId required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: app, error: appError } = await supabase
      .from("Application")
      .select("id, organisationId, organisation_id, login_required_notified_at, Grant(name)")
      .eq("id", applicationId)
      .single();

    if (appError || !app) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    const raw = app as {
      id: string;
      organisationId?: string;
      organisation_id?: string;
      login_required_notified_at?: string | null;
      Grant?: { name: string } | { name: string }[];
    };
    const orgId = raw.organisationId ?? raw.organisation_id;
    if (!orgId) {
      return NextResponse.json({ error: "Application has no organisation" }, { status: 400 });
    }

    if (raw.login_required_notified_at) {
      return NextResponse.json({ success: true, skipped: true, reason: "already_notified" });
    }

    const grantObj = raw.Grant;
    const grantName = Array.isArray(grantObj) ? grantObj[0]?.name : grantObj?.name;
    const name = grantName ?? "your grant";

    await notifyOrgMembers(orgId, "application_login_required", {
      grantName: name,
      applicationId: raw.id,
    });

    const { error: updateErr } = await supabase
      .from("Application")
      .update({ login_required_notified_at: new Date().toISOString() })
      .eq("id", applicationId);

    if (updateErr) {
      console.error("[notify-login-required] Failed to set login_required_notified_at", updateErr);
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[notify-login-required]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
