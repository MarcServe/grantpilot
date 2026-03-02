import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { notifyOrgMembers } from "@/lib/notify";
import { inngest } from "@/inngest/client";
import { checkUsageLimit, recordUsage } from "@/lib/plan-check";
import { createDefaultTasksForApplication } from "@/lib/application-tasks";

const startSchema = z.object({
  grantId: z.string().min(1),
  profileId: z.string().min(1),
  autopilot: z.boolean().optional(),
});

const SESSION_ITEMS_BASE = [
  { action: "open_grant_url", task_type: "grant_application" },
  { action: "fill_company_details", task_type: "grant_application" },
  { action: "fill_financials", task_type: "grant_application" },
  { action: "upload_documents", task_type: "grant_application" },
  { action: "prepare_review", task_type: "grant_application" },
];
const SUBMIT_ITEM = { action: "submit_application", task_type: "grant_application" };
function getSessionItems(autopilot: boolean) {
  return autopilot ? [...SESSION_ITEMS_BASE, SUBMIT_ITEM] : SESSION_ITEMS_BASE;
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { user, orgId } = await getActiveOrg();

    const body = await req.json();
    const parsed = startSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { grantId, profileId, autopilot = false } = parsed.data;

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
      .select("id, name, applicationUrl, deadline")
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

    const applicationId = crypto.randomUUID();
    const now = new Date().toISOString();
    const { data: application, error: appError } = await supabase
      .from("Application")
      .insert({
        id: applicationId,
        organisationId: orgId,
        createdById: user.id,
        grantId,
        profileId,
        status: "FILLING",
        createdAt: now,
        updatedAt: now,
      })
      .select("id")
      .single();

    if (appError || !application) {
      console.error("[APPLICATION_START] create application failed", appError);
      const detail = appError?.message ?? appError?.details ?? null;
      return NextResponse.json(
        { error: "Failed to create application", ...(detail && { detail }) },
        { status: 500 }
      );
    }

    const publicId = `grantapp_${application.id}`;

    const SESSION_ITEMS = getSessionItems(autopilot);
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

    createDefaultTasksForApplication({
      applicationId: application.id,
      organisationId: orgId,
      grantId,
      grantDeadline: (grant as { deadline?: string } | null)?.deadline ?? null,
    }).catch(console.error);

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
