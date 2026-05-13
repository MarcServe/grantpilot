import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase";
import { notifyOrgMembers } from "@/lib/notify";
import { inngest } from "@/inngest/client";
import { checkUsageLimit, recordUsage } from "@/lib/plan-check";
import { verifyStartApplicationToken } from "@/lib/start-application-token";
import { createDefaultTasksForApplication } from "@/lib/application-tasks";
import { buildSessionItems, matchPortalRecipe } from "@/lib/session-items";
import { isGrantLinkUsable } from "@/lib/grant-freshness";

const bodySchema = z.object({ token: z.string().min(1) });

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

    let profile: { id: string } | null = null;
    const { data: p1 } = await supabase
      .from("BusinessProfile")
      .select("id")
      .eq("id", profileId)
      .eq("organisationId", orgId)
      .maybeSingle();
    profile = p1 as { id: string } | null;
    if (!profile) {
      const { data: p2 } = await supabase
        .from("BusinessProfile")
        .select("id")
        .eq("id", profileId)
        .eq("organisation_id", orgId)
        .maybeSingle();
      profile = p2 as { id: string } | null;
    }
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const { data: grant } = await supabase
      .from("Grant")
      .select("id, name, applicationUrl, deadline, url_status")
      .eq("id", grantId)
      .single();
    if (!grant) {
      return NextResponse.json({ error: "Grant not found" }, { status: 404 });
    }

    if (!isGrantLinkUsable(grant as { deadline?: string | null; url_status?: string | null })) {
      return NextResponse.json(
        { error: "This grant's application link is broken or the deadline has passed. Please choose a current grant or use 'Apply by link' with an updated URL." },
        { status: 400 }
      );
    }

    let createdById: string | null = null;

    // Try multiple query patterns because column naming can vary (camelCase vs snake_case)
    const memberQueries = [
      () => supabase.from("OrganisationMember").select("*").eq("organisationId", orgId).limit(1),
      () => supabase.from("OrganisationMember").select("*").eq("organisation_id", orgId).limit(1),
    ];

    for (const query of memberQueries) {
      if (createdById) break;
      const { data } = await query();
      const row = (data ?? [])[0] as Record<string, unknown> | undefined;
      if (row) {
        createdById = (row.userId ?? row.user_id) as string | null;
      }
    }

    // Fallback: look up via User table joined through membership
    if (!createdById) {
      const { data } = await supabase
        .from("OrganisationMember")
        .select("*, User(id)")
        .eq("organisationId", orgId)
        .limit(1);
      const row = (data ?? [])[0] as { User?: { id: string } | null } | undefined;
      createdById = row?.User?.id ?? null;
    }

    // Fallback: use creator of latest application for this org
    if (!createdById) {
      const appQueries = [
        () => supabase.from("Application").select("*").eq("organisationId", orgId).order("createdAt", { ascending: false }).limit(1).maybeSingle(),
        () => supabase.from("Application").select("*").eq("organisation_id", orgId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ];
      for (const query of appQueries) {
        if (createdById) break;
        const { data } = await query();
        const app = data as Record<string, unknown> | null;
        createdById = (app?.createdById ?? app?.created_by_id) as string | null;
      }
    }

    // Last resort: find any user linked to this profile's org
    if (!createdById) {
      const { data } = await supabase
        .from("User")
        .select("id, OrganisationMember!inner(organisationId)")
        .limit(1);
      const users = (data ?? []) as { id: string }[];
      if (users.length > 0) {
        createdById = users[0].id;
      }
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
        createdById,
        grantId,
        profileId,
        profile_overrides: profileOverrides && Object.keys(profileOverrides).length > 0 ? profileOverrides : null,
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
    const portalRecipe = matchPortalRecipe(grant.applicationUrl ?? "");
    const sessionItemDefs = buildSessionItems({ portalRecipe });

    const { data: session, error: sessionError } = await supabase
      .from("cu_sessions")
      .insert({
        public_id: publicId,
        task_type: "grant_application",
        status: "running",
        total_items: sessionItemDefs.length,
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

    const items = sessionItemDefs.map((item) => ({
      session_id: session.id,
      task_type: item.task_type,
      action: item.action,
      grant_id: grantId,
      grant_name: grant.name,
      grant_url: grant.applicationUrl,
      status: "pending",
      ...(item.extra_data ? { extra_data: item.extra_data } : {}),
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
