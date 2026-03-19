import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { enqueueGrantForScoutIfProgrammeUrl } from "@/lib/enqueue-scout";

const patchSchema = z.object({
  applicationUrl: z.string().url("Please enter a valid URL"),
});

/**
 * PATCH /api/grants/[id]
 * Body: { applicationUrl: string }
 * Updates the grant's application URL (e.g. after user sets direct link).
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await getActiveOrg();
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Grant ID required" }, { status: 400 });
    }

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.flatten().fieldErrors.applicationUrl?.[0] ?? "Invalid input";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("Grant")
      .update({ applicationUrl: parsed.data.applicationUrl, updatedAt: new Date().toISOString() })
      .eq("id", id)
      .select("id, applicationUrl")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Grant not found" }, { status: 404 });
    }

    await enqueueGrantForScoutIfProgrammeUrl(id).catch(() => {});

    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Request failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
