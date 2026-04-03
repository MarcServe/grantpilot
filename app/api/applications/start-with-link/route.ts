import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { notifyOrgMembers } from "@/lib/notify";
import { inngest } from "@/inngest/client";
import { checkUsageLimit, recordUsage } from "@/lib/plan-check";
import { enqueueGrantForScoutIfProgrammeUrl } from "@/lib/enqueue-scout";
import { requestEligibilityRefresh } from "@/lib/eligibility-refresh-trigger";

const linkEntrySchema = z.object({
  applicationUrl: z.string().url("Please enter a valid grant application URL"),
  grantName: z.string().max(300).optional(),
  funder: z.string().max(200).optional(),
  eligibility: z.string().max(5000).optional(),
});

const startWithLinkSchema = z.object({
  profileId: z.string().min(1, "Profile is required"),
  autopilot: z.boolean().optional(),
  applicationUrl: z.string().url().optional(),
  grantName: z.string().max(300).optional(),
  funder: z.string().max(200).optional(),
  eligibility: z.string().max(5000).optional(),
  fixGrantId: z.string().optional(),
  links: z.array(linkEntrySchema).max(20).optional(),
}).refine(
  (d) => d.applicationUrl ?? (d.links && d.links.length > 0),
  { message: "Provide applicationUrl or at least one link in links", path: ["applicationUrl"] }
);

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

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return url;
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { user, orgId } = await getActiveOrg();

    const body = await req.json();
    const parsed = startWithLinkSchema.safeParse(body);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const msg = flat.fieldErrors.applicationUrl?.[0]
        ?? flat.fieldErrors.profileId?.[0]
        ?? flat.fieldErrors.links?.[0]
        ?? flat.formErrors[0]
        ?? "Invalid input";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const { profileId, autopilot = false } = parsed.data;
    const links: { applicationUrl: string; grantName?: string; funder?: string; eligibility?: string }[] =
      parsed.data.links?.length
        ? parsed.data.links
        : parsed.data.applicationUrl
          ? [{
              applicationUrl: parsed.data.applicationUrl,
              grantName: parsed.data.grantName,
              funder: parsed.data.funder,
              eligibility: parsed.data.eligibility,
            }]
          : [];

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

    const { allowed, remaining } = await checkUsageLimit(orgId, "autofill");
    if (!allowed || remaining < links.length) {
      return NextResponse.json(
        {
          error:
            links.length > 1
              ? `You need ${links.length} auto-fills but only ${remaining} remaining this month. Upgrade or reduce the number of links.`
              : "You've reached your auto-fill limit this month. Upgrade your plan to continue.",
        },
        { status: 403 }
      );
    }

    const sessionItems = getSessionItems(autopilot);
    const results: { applicationId: string; grantId: string; grantName: string }[] = [];
    const seenUrls = new Set<string>();

    for (let i = 0; i < links.length; i++) {
      const { applicationUrl, grantName: gn, funder: fu, eligibility: el } = links[i];
      const urlKey = normalizeUrl(applicationUrl);
      if (seenUrls.has(urlKey)) continue;
      seenUrls.add(urlKey);

      const externalId = `user_${orgId}_${Date.now()}_${i}`;
      const name = gn?.trim() || "Grant from link";
      const funderName = fu?.trim() || "Unknown";
      const eligibilityText = el?.trim() || "See application page.";

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
        continue;
      }

      await enqueueGrantForScoutIfProgrammeUrl(grant.id).catch(() => {});

      const { data: application, error: appError } = await supabase
        .from("Application")
        .insert({
          organisationId: orgId,
          createdById: user.id,
          grantId: grant.id,
          profileId,
          status: "FILLING",
        })
        .select("id")
        .single();

      if (appError || !application) {
        console.error("[APPLICATION_START_WITH_LINK] application create failed", appError);
        continue;
      }

      const publicId = `grantapp_${application.id}`;

      const { data: session, error: sessionError } = await supabase
        .from("cu_sessions")
        .insert({
          public_id: publicId,
          task_type: "grant_application",
          status: "running",
          total_items: sessionItems.length,
          processed_items: 0,
          organisation_id: orgId,
          business_profile_id: profileId,
        })
        .select("id")
        .single();

      if (sessionError || !session) {
        await supabase.from("Application").update({ status: "FAILED" }).eq("id", application.id);
        continue;
      }

      const items = sessionItems.map((item) => ({
        session_id: session.id,
        task_type: item.task_type,
        action: item.action,
        grant_id: grant.id,
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

      results.push({ applicationId: application.id, grantId: grant.id, grantName: grant.name });
    }

    if (results.length === 0) {
      return NextResponse.json(
        { error: "Could not start any applications. Check URLs and try again." },
        { status: 400 }
      );
    }

    if (parsed.data.fixGrantId && results.length > 0) {
      const correctedUrl = links[0]?.applicationUrl;
      if (correctedUrl) {
        await supabase
          .from("Grant")
          .update({
            applicationUrl: correctedUrl,
            url_status: "live",
            url_checked_at: new Date().toISOString(),
          })
          .eq("id", parsed.data.fixGrantId);
        console.info(`[start-with-link] Corrected URL for grant ${parsed.data.fixGrantId} → ${correctedUrl}`);
      }
    }

    await requestEligibilityRefresh(orgId, "applications.start-with-link");

    return NextResponse.json({
      applications: results,
      applicationId: results[0].applicationId,
      sessionPublicId: `grantapp_${results[0].applicationId}`,
      grantId: results[0].grantId,
    });
  } catch (error) {
    console.error("[APPLICATION_START_WITH_LINK]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
