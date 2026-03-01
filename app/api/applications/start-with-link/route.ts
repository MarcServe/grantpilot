import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { notifyOrgMembers } from "@/lib/notify";
import { inngest } from "@/inngest/client";
import { checkUsageLimit, recordUsage } from "@/lib/plan-check";

const startWithLinkSchema = z.object({
  applicationUrl: z.string().url("Please enter a valid grant application URL"),
  profileId: z.string().min(1, "Profile is required"),
  grantName: z.string().max(300).optional(),
  funder: z.string().max(200).optional(),
  eligibility: z.string().max(5000).optional(),
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
    const parsed = startWithLinkSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.flatten().fieldErrors.applicationUrl?.[0]
        ?? parsed.error.flatten().fieldErrors.profileId?.[0]
        ?? "Invalid input";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const { applicationUrl, profileId, grantName, funder, eligibility } = parsed.data;

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

    const { allowed } = await checkUsageLimit(orgId, "autofill");
    if (!allowed) {
      return NextResponse.json(
        { error: "You've reached your auto-fill limit this month. Upgrade your plan to continue." },
        { status: 403 }
      );
    }

    const externalId = `user_${orgId}_${Date.now()}`;
    const name = grantName?.trim() || "Grant from link";
    const funderName = funder?.trim() || "Unknown";
    const eligibilityText = eligibility?.trim() || "See application page.";

    const { data: grant, error: grantError } = await supabase
      .from("Grant")
      .insert({
        name,
        funder: funderName,
        amount: null,
        deadline: null,
        applicationUrl,
        eligibility: eligibilityText,
        sectors: ["Other"],
        regions: ["England"],
        externalId,
      })
      .select("id, name, applicationUrl")
      .single();

    if (grantError || !grant) {
      console.error("[APPLICATION_START_WITH_LINK] grant create failed", grantError);
      return NextResponse.json({ error: "Failed to create grant record" }, { status: 500 });
    }

    const grantId = grant.id;

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
      console.error("[APPLICATION_START_WITH_LINK] application create failed", appError);
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
      await supabase.from("Application").update({ status: "FAILED" }).eq("id", application.id);
      console.error("[APPLICATION_START_WITH_LINK] session create failed", sessionError);
      return NextResponse.json(
        { error: "Failed to start execution session" },
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

    await supabase.from("cu_session_items").insert(items);
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
      grantId,
    });
  } catch (error) {
    console.error("[APPLICATION_START_WITH_LINK]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
