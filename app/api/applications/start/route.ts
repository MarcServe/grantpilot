import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { notifyOrgMembers } from "@/lib/notify";
import { inngest } from "@/inngest/client";
import { checkUsageLimit, recordUsage } from "@/lib/plan-check";
import { createDefaultTasksForApplication } from "@/lib/application-tasks";
import { requestEligibilityRefresh } from "@/lib/eligibility-refresh-trigger";
import { buildSessionItems, matchPortalRecipe } from "@/lib/session-items";
import { isGrantLinkUsable } from "@/lib/grant-freshness";

const startSchema = z.object({
  grantId: z.string().min(1),
  profileId: z.string().min(1),
  autopilot: z.boolean().optional(),
  focusNotes: z.string().optional(),
});

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
      .select("id, name, applicationUrl, deadline, url_status, eligibility, description, objectives")
      .eq("id", grantId)
      .single();
    if (!grant) {
      return NextResponse.json({ error: "Grant not found" }, { status: 404 });
    }

    if (!isGrantLinkUsable(grant as { deadline?: string | null; url_status?: string | null; eligibility?: string | null; description?: string | null; objectives?: string | null })) {
      return NextResponse.json(
        { error: "This grant appears closed, stale, or has a broken application link. Please choose a current grant or use 'Apply by link' with an updated URL." },
        { status: 400 }
      );
    }

    const { allowed } = await checkUsageLimit(orgId, "autofill");
    if (!allowed) {
      return NextResponse.json(
        { error: "You've reached your application prep limit this month. Upgrade your plan to continue." },
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

    const { data: assessmentOverride } = await supabase
      .from("EligibilityAssessment")
      .select("profile_overrides")
      .eq("organisation_id", orgId)
      .eq("profile_id", profileId)
      .eq("grant_id", grantId)
      .maybeSingle();
    const profileOverrides =
      (assessmentOverride as { profile_overrides?: Record<string, string | null> } | null)?.profile_overrides ?? null;

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
        focusNotes: parsed.data.focusNotes?.trim() || null,
        profile_overrides: profileOverrides && Object.keys(profileOverrides).length > 0 ? profileOverrides : null,
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

    const portalRecipe = matchPortalRecipe(grant.applicationUrl ?? "");
    const SESSION_ITEMS = buildSessionItems({ autopilot, portalRecipe });
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
      ...(item.extra_data ? { extra_data: item.extra_data } : {}),
    }));

    const { error: itemsError } = await supabase
      .from("cu_session_items")
      .insert(items);

    if (itemsError) {
      console.error("[APPLICATION_START] items creation failed", itemsError);
      await supabase
        .from("cu_sessions")
        .update({
          status: "failed",
          error_log: `Failed to create execution steps: ${itemsError.message}`,
        })
        .eq("id", session.id);
      await supabase
        .from("Application")
        .update({ status: "FAILED", updatedAt: new Date().toISOString() })
        .eq("id", application.id);
      return NextResponse.json(
        { error: "Failed to create execution steps", detail: itemsError.message },
        { status: 500 }
      );
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

    await requestEligibilityRefresh(orgId, "applications.start");

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
