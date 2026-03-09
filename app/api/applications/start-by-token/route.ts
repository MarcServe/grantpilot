import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase";
import { notifyOrgMembers } from "@/lib/notify";
import { inngest } from "@/inngest/client";
import { checkUsageLimit, recordUsage } from "@/lib/plan-check";
import { verifyStartApplicationToken } from "@/lib/start-application-token";
import { createDefaultTasksForApplication } from "@/lib/application-tasks";

const bodySchema = z.object({ token: z.string().min(1) });

const SESSION_ITEMS_BASE = [
  { action: "open_grant_url", task_type: "grant_application" },
  { action: "fill_company_details", task_type: "grant_application" },
  { action: "fill_financials", task_type: "grant_application" },
  { action: "upload_documents", task_type: "grant_application" },
  { action: "prepare_review", task_type: "grant_application" },
];

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const payload = verifyStartApplicationToken(parsed.data.token);
    if (!payload) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 400 });
    }

    const { grantId, profileId, organisationId: orgId } = payload;
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

    let createdById: string | null = null;

    type MemberRow = { userId?: string; user_id?: string };
    let members: MemberRow[] = [];
    const membersRes = await supabase
      .from("OrganisationMember")
      .select("userId, user_id")
      .eq("organisationId", orgId)
      .limit(1);
    members = (membersRes.data ?? []) as MemberRow[];
    if (members.length === 0) {
      const alt = await supabase
        .from("OrganisationMember")
        .select("userId, user_id")
        .eq("organisation_id", orgId)
        .limit(1);
      members = (alt.data ?? []) as MemberRow[];
    }
    const firstMember = members[0];
    if (firstMember) {
      createdById = firstMember.userId ?? firstMember.user_id ?? null;
    }

    // Fallback: if no members found (e.g. query/RLS edge case), use creator of latest application for this org
    if (!createdById) {
      const { data: latestApp } = await supabase
        .from("Application")
        .select("createdById, created_by_id")
        .eq("organisationId", orgId)
        .order("createdAt", { ascending: false })
        .limit(1)
        .maybeSingle();
      const app = latestApp as { createdById?: string; created_by_id?: string } | null;
      createdById = app?.createdById ?? app?.created_by_id ?? null;
    }

    if (!createdById) {
      return NextResponse.json(
        {
          error:
            "Organisation has no members. Please sign in to Grants-Copilot first, then try this link again.",
        },
        { status: 400 }
      );
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
        createdById,
        grantId,
        profileId,
        status: "FILLING",
        createdAt: now,
        updatedAt: now,
      })
      .select("id")
      .single();

    if (appError || !application) {
      console.error("[APPLICATION_START_BY_TOKEN] create application failed", appError);
      return NextResponse.json(
        { error: "Failed to create application" },
        { status: 500 }
      );
    }

    const publicId = `grantapp_${application.id}`;
    const { data: session, error: sessionError } = await supabase
      .from("cu_sessions")
      .insert({
        public_id: publicId,
        task_type: "grant_application",
        status: "running",
        total_items: SESSION_ITEMS_BASE.length,
        processed_items: 0,
        organisation_id: orgId,
        business_profile_id: profileId,
      })
      .select("id")
      .single();

    if (sessionError || !session) {
      await supabase.from("Application").update({ status: "FAILED" }).eq("id", application.id);
      console.error("[APPLICATION_START_BY_TOKEN] session creation failed", sessionError);
      return NextResponse.json(
        { error: "Failed to create execution session" },
        { status: 500 }
      );
    }

    const items = SESSION_ITEMS_BASE.map((item) => ({
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

    return NextResponse.json({ applicationId: application.id });
  } catch (error) {
    console.error("[APPLICATION_START_BY_TOKEN]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
