import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

const postSchema = z.object({
  grantIds: z.array(z.string().min(1)).min(1).max(200),
});

/**
 * GET /api/grants/saved
 * Returns saved grant IDs for the current org/profile.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const { org, orgId } = await getActiveOrg();
    const profile = org.profiles?.[0];
    if (!profile) {
      return NextResponse.json({ savedGrantIds: [] });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("SavedGrant")
      .select("grant_id")
      .eq("organisation_id", orgId)
      .eq("profile_id", profile.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const savedGrantIds = (data ?? []).map((r: { grant_id: string }) => r.grant_id);
    return NextResponse.json({ savedGrantIds });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Request failed" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/grants/saved
 * Body: { grantIds: string[] } — add grants to saved list (idempotent).
 */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { org, orgId } = await getActiveOrg();
    const profile = org.profiles?.[0];
    if (!profile) {
      return NextResponse.json(
        { error: "Complete your business profile first." },
        { status: 400 }
      );
    }

    const body = await req.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Provide grantIds: an array of grant IDs (1–200)." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    for (const grantId of parsed.data.grantIds) {
      await supabase.from("SavedGrant").upsert(
        {
          organisation_id: orgId,
          profile_id: profile.id,
          grant_id: grantId,
        },
        { onConflict: "organisation_id,profile_id,grant_id" }
      );
    }

    return NextResponse.json({ success: true, added: parsed.data.grantIds.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Request failed" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/grants/saved?grantId=xxx
 * Remove one grant from saved list.
 */
export async function DELETE(req: Request): Promise<NextResponse> {
  try {
    const { org, orgId } = await getActiveOrg();
    const profile = org.profiles?.[0];
    if (!profile) {
      return NextResponse.json({ error: "Profile required" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const grantId = searchParams.get("grantId");
    if (!grantId) {
      return NextResponse.json({ error: "grantId query required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("SavedGrant")
      .delete()
      .eq("organisation_id", orgId)
      .eq("profile_id", profile.id)
      .eq("grant_id", grantId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Request failed" },
      { status: 500 }
    );
  }
}
