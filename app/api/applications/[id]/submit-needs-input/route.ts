import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * POST /api/applications/[id]/submit-needs-input
 * Saves user-provided answers for missing required fields and resumes the session so the worker continues.
 * Body: { answers: Record<string, string> } — keys are field labels from needs_input.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { orgId } = await getActiveOrg();
    const { id: applicationId } = await params;
    if (!applicationId) {
      return NextResponse.json({ error: "Application ID required" }, { status: 400 });
    }

    const body = await req.json();
    const answers = body.answers;
    if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
      return NextResponse.json({ error: "answers object required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: app, error: appError } = await supabase
      .from("Application")
      .select("id, organisationId, organisation_id, status")
      .eq("id", applicationId)
      .single();

    if (appError || !app) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    const raw = app as { id: string; organisationId?: string; organisation_id?: string; status: string };
    const appOrgId = raw.organisationId ?? raw.organisation_id;
    if (appOrgId !== orgId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (raw.status !== "NEEDS_INPUT") {
      return NextResponse.json({ error: "Application is not waiting for input" }, { status: 400 });
    }

    const answersRecord: Record<string, string> = {};
    for (const [k, v] of Object.entries(answers)) {
      if (typeof k === "string" && typeof v === "string") {
        answersRecord[k] = v;
      }
    }

    const { error: updateAppErr } = await supabase
      .from("Application")
      .update({
        needs_input_answers: answersRecord,
        status: "FILLING",
        updatedAt: new Date().toISOString(),
      })
      .eq("id", applicationId);

    if (updateAppErr) {
      return NextResponse.json({ error: updateAppErr.message }, { status: 500 });
    }

    const publicId = `grantapp_${applicationId}`;
    const { data: session } = await supabase
      .from("cu_sessions")
      .select("id")
      .eq("public_id", publicId)
      .single();

    if (session) {
      await supabase
        .from("cu_sessions")
        .update({ status: "resumed", updated_at: new Date().toISOString() })
        .eq("id", (session as { id: number }).id);
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Request failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
