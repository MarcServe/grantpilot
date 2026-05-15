import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { notifyOrgMembers } from "@/lib/notify";
import { checkUsageLimit, recordUsage } from "@/lib/plan-check";
import { enqueueGrantForScoutIfProgrammeUrl } from "@/lib/enqueue-scout";
import { requestEligibilityRefresh } from "@/lib/eligibility-refresh-trigger";
import { normalizeGrantApplicationUrl } from "@/lib/grant-url";
import { createDefaultTasksForApplication } from "@/lib/application-tasks";

const linkEntrySchema = z.object({
  applicationUrl: z.string().url("Please enter a valid grant application URL"),
  grantName: z.string().max(300).optional(),
  funder: z.string().max(200).optional(),
  eligibility: z.string().max(5000).optional(),
});

const startWithLinkSchema = z.object({
  profileId: z.string().min(1, "Profile is required"),
  focusNotes: z.string().max(2000).optional(),
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

/** Stable key for deduping URLs in one batch (full URL so query strings differ). */
function urlDedupKey(url: string): string {
  try {
    return new URL(url).href;
  } catch {
    return url.trim();
  }
}

function normalizeIncomingBody(body: Record<string, unknown>): void {
  if (typeof body.applicationUrl === "string") {
    const n = normalizeGrantApplicationUrl(body.applicationUrl);
    if (n) body.applicationUrl = n;
  }
  if (Array.isArray(body.links)) {
    for (const entry of body.links) {
      if (entry && typeof entry === "object" && typeof (entry as { applicationUrl?: unknown }).applicationUrl === "string") {
        const e = entry as { applicationUrl: string };
        const n = normalizeGrantApplicationUrl(e.applicationUrl);
        if (n) e.applicationUrl = n;
      }
    }
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { user, orgId } = await getActiveOrg();

    const body = (await req.json()) as Record<string, unknown>;
    normalizeIncomingBody(body);
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

    const { profileId } = parsed.data;
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
              ? `You need ${links.length} application prep runs but only ${remaining} remaining this month. Upgrade or reduce the number of links.`
              : "You've reached your application prep limit this month. Upgrade your plan to continue.",
        },
        { status: 403 }
      );
    }

    const results: { applicationId: string; grantId: string; grantName: string; applicationUrl: string }[] = [];
    const seenUrls = new Set<string>();

    for (let i = 0; i < links.length; i++) {
      const { applicationUrl, grantName: gn, funder: fu, eligibility: el } = links[i];
      const urlKey = urlDedupKey(applicationUrl);
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

      const { data: existingApplication } = await supabase
        .from("Application")
        .select("id")
        .eq("organisationId", orgId)
        .eq("profileId", profileId)
        .eq("grantId", grant.id)
        .maybeSingle();

      let applicationId = existingApplication?.id ?? null;
      if (!applicationId) {
        const now = new Date().toISOString();
        const { data: application, error: appError } = await supabase
          .from("Application")
          .insert({
            organisationId: orgId,
            createdById: user.id,
            grantId: grant.id,
            profileId,
            focusNotes: parsed.data.focusNotes?.trim() || null,
            status: "REVIEW_REQUIRED",
            createdAt: now,
            updatedAt: now,
          })
          .select("id")
          .single();

        if (appError || !application?.id) {
          console.error("[APPLICATION_START_WITH_LINK] application create failed", appError);
          continue;
        }

        applicationId = application.id;
        createDefaultTasksForApplication({
          applicationId,
          organisationId: orgId,
          grantId: grant.id,
          grantDeadline: null,
        }).catch(console.error);
      }

      await recordUsage(orgId, "autofill");

      notifyOrgMembers(orgId, "application_started", {
        grantName: grant.name,
        applicationId,
      }).catch(console.error);

      results.push({ applicationId, grantId: grant.id, grantName: grant.name, applicationUrl });
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
