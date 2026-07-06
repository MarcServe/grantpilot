import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { markGrantUserState } from "@/lib/grant-user-state";
import { createDefaultTasksForApplication } from "@/lib/application-tasks";
import { clearEligibleMatchCaches } from "@/lib/eligible-match-cache";

const schema = z.object({
  grantId: z.string().min(1),
  status: z.enum(["saved", "viewed", "deferred", "applied", "dismissed"]),
  notes: z.string().max(2000).optional(),
});

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { user, org, orgId } = await getActiveOrg();
    const profile = org.profiles?.[0];
    if (!profile) {
      return NextResponse.json({ error: "Complete your business profile first." }, { status: 400 });
    }

    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid grant state request" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    await markGrantUserState(supabase, {
      organisationId: orgId,
      profileId: profile.id,
      grantId: parsed.data.grantId,
      status: parsed.data.status,
      notes: parsed.data.notes ?? null,
    });
    clearEligibleMatchCaches();

    let applicationId: string | null = null;
    if (parsed.data.status === "applied") {
      const { data: existing } = await supabase
        .from("Application")
        .select("id")
        .eq("organisationId", orgId)
        .eq("profileId", profile.id)
        .eq("grantId", parsed.data.grantId)
        .maybeSingle();

      if (existing?.id) {
        applicationId = existing.id;
      } else {
        const now = new Date().toISOString();
        const { data: grant } = await supabase
          .from("Grant")
          .select("deadline")
          .eq("id", parsed.data.grantId)
          .maybeSingle();

        const { data: application, error: appError } = await supabase
          .from("Application")
          .insert({
            organisationId: orgId,
            createdById: user.id,
            grantId: parsed.data.grantId,
            profileId: profile.id,
            focusNotes:
              parsed.data.notes?.trim() ||
              "Marked from the grant page. Review prepared documents, then mark submitted once the funder application has been sent.",
            status: "REVIEW_REQUIRED",
            createdAt: now,
            updatedAt: now,
          })
          .select("id")
          .single();

        if (appError || !application?.id) {
          return NextResponse.json(
            { error: appError?.message ?? "Could not add this grant to Applications" },
            { status: 500 }
          );
        }

        const createdApplicationId = application.id;
        applicationId = createdApplicationId;
        createDefaultTasksForApplication({
          applicationId: createdApplicationId,
          organisationId: orgId,
          grantId: parsed.data.grantId,
          grantDeadline: (grant as { deadline?: string | null } | null)?.deadline ?? null,
        }).catch(console.error);
      }
    }

    return NextResponse.json({ success: true, applicationId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Request failed" },
      { status: 500 }
    );
  }
}
