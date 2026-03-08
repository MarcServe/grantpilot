import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

const snapshotSchema = z.object({
  fields: z.array(
    z.object({
      label: z.string(),
      name: z.string(),
      value: z.string(),
    })
  ),
});

/**
 * PUT /api/applications/[id]/snapshot
 * Save user-edited snapshot fields back to the Application.
 * The worker will use these edited values when submitting.
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { orgId } = await getActiveOrg();
    const { id: applicationId } = await params;
    const supabase = getSupabaseAdmin();

    const { data: app } = await supabase
      .from("Application")
      .select("id, status, filled_snapshot")
      .eq("id", applicationId)
      .eq("organisationId", orgId)
      .maybeSingle();

    if (!app) {
      const alt = await supabase
        .from("Application")
        .select("id, status, filled_snapshot")
        .eq("id", applicationId)
        .eq("organisation_id", orgId)
        .maybeSingle();
      if (!alt.data) {
        return NextResponse.json({ error: "Application not found" }, { status: 404 });
      }
    }

    const body = await req.json();
    const parsed = snapshotSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid snapshot data" }, { status: 400 });
    }

    const existing = (app as { filled_snapshot?: Record<string, unknown> } | null)?.filled_snapshot ?? {};
    const updatedSnapshot = {
      ...existing,
      fields: parsed.data.fields,
      editedAt: new Date().toISOString(),
    };

    await supabase
      .from("Application")
      .update({ filled_snapshot: updatedSnapshot })
      .eq("id", applicationId);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[SNAPSHOT_UPDATE]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
