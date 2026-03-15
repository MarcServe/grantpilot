import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { notifyOrgMembers } from "@/lib/notify";

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;

/**
 * POST /api/internal/notify-application-submitted
 * Called by the worker when it successfully submits an application (sets status to SUBMITTED).
 * Sends application_submitted notification to org members for immediate confirmation.
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
      .select("id, organisationId, organisation_id, Grant(name)")
      .eq("id", applicationId)
      .single();

    if (appError || !app) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    const raw = app as {
      id: string;
      organisationId?: string;
      organisation_id?: string;
      Grant?: { name: string } | { name: string }[];
    };
    const orgId = raw.organisationId ?? raw.organisation_id;
    if (!orgId) {
      return NextResponse.json({ error: "Application has no organisation" }, { status: 400 });
    }

    const grantObj = raw.Grant;
    const grantName = Array.isArray(grantObj) ? grantObj[0]?.name : grantObj?.name;

    await notifyOrgMembers(orgId, "application_submitted", {
      grantName: grantName ?? "Grant",
      applicationId: raw.id,
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[notify-application-submitted]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
