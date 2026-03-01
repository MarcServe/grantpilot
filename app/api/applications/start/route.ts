import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { notifyOrgMembers } from "@/lib/notify";
import { inngest } from "@/inngest/client";
import { checkUsageLimit, recordUsage } from "@/lib/plan-check";

const startSchema = z.object({
  grantId: z.string().min(1),
  profileId: z.string().min(1),
});

const SESSION_ITEMS = [
  { action: "open_grant_url", task_type: "grant_application" },
  { action: "fill_company_details", task_type: "grant_application" },
  { action: "fill_financials", task_type: "grant_application" },
  { action: "upload_documents", task_type: "grant_application" },
  { action: "prepare_review", task_type: "grant_application" },
];

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { user, orgId } = await getActiveOrg();

    const body = await req.json();
    const parsed = startSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { grantId, profileId } = parsed.data;

    const supabase = getSupabaseAdmin();

    const { data: profile } = await supabase
      .from("BusinessProfile")
      .select("id")
      .eq("id", profileId)
      .eq("organisationId", orgId)
      .maybeSingle();
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const { data: grant } = await supabase
      .from("Grant")
      .select("id, name, applicationUrl")
      .eq("id", grantId)
      .single();
    if (!grant) {
      return NextResponse.json({ error: "Grant not found" }, { status: 404 });
    }

    const { allowed } = await checkUsageLimit(orgId, "autofill");
    if (!allowed) {
      return NextResponse.json(
        { error: "You've reached your auto-fill limit this month. Upgrade your plan to continue." },
        { status: 403 }
      );
    }

    const { data: existing } = await supabase
      .from("Application")
      .select("id")
      .eq("organisationId", orgId)
      .eq("grantId", grantId)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: "Application already exists for this grant", applicationId: existing.id },
        { status: 409 }
      );
    }

    const { data: application, error: appError } = await supabase
      .from("Application")
      .insert({
        organisationId: orgId,
        createdById: user.id,
        grantId,
        profileId,
        status: "FILLING",
      })
      .select("id")
      .single();

    if (appError || !application) {
      console.error("[APPLICATION_START] create application failed", appError);
      return NextResponse.json({ error: "Failed to create application" }, { status: 500 });
    }

    const publicId = `grantapp_${application.id}`;

    const { data: session, error: sessionError } = await supabase
      .from("cu_sessions")
      .insert({
        public_id: publicId,
        task_type: "grant_application",
        status: "running",
        total_items: SESSION_ITEMS.length,
        processed_items: 0,
        organisation_id: orgId,
        business_profile_id: profileId,
      })
      .select("id")
      .single();

    if (sessionError || !session) {
      await supabase
        .from("Application")
        .update({ status: "FAILED" })
        .eq("id", application.id);
      console.error("[APPLICATION_START] session creation failed", sessionError);
      return NextResponse.json(
        { error: "Failed to create execution session" },
        { status: 500 }
      );
    }

    const items = SESSION_ITEMS.map((item) => ({
      session_id: session.id,
      task_type: item.task_type,
      action: item.action,
      grant_id: grantId,
      grant_name: grant.name,
      grant_url: grant.applicationUrl,
      status: "pending",
    }));

    const { error: itemsError } = await supabase
      .from("cu_session_items")
      .insert(items);

    if (itemsError) {
      console.error("[APPLICATION_START] items creation failed", itemsError);
    }

    await recordUsage(orgId, "autofill");

    notifyOrgMembers(orgId, "application_started", {
      grantName: grant.name,
      applicationId: application.id,
    }).catch(console.error);

    inngest.send({
      name: "app/session.started",
      data: { applicationId: application.id, sessionPublicId: publicId },
    }).catch(console.error);

    return NextResponse.json({
      applicationId: application.id,
      sessionPublicId: publicId,
    });
  } catch (error) {
    console.error("[APPLICATION_START]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
