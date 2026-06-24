import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { enqueueGrantForScoutIfProgrammeUrl } from "@/lib/enqueue-scout";
import {
  classifyGrantApplicationUrl,
  isVerifiedApplicationQuality,
} from "@/lib/grant-application-url-quality";

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
    const { data: existing } = await supabase
      .from("Grant")
      .select("id, applicationUrl, detailUrl")
      .eq("id", id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: "Grant not found" }, { status: 404 });
    }

    const submittedUrl = parsed.data.applicationUrl.trim();
    const classification = classifyGrantApplicationUrl(submittedUrl);
    const directApplicationUrl = isVerifiedApplicationQuality(classification.quality) ? submittedUrl : null;
    const existingDetailUrl = (existing as { detailUrl?: string | null; applicationUrl?: string | null }).detailUrl;
    const detailUrl = directApplicationUrl ? existingDetailUrl ?? (existing as { applicationUrl?: string | null }).applicationUrl ?? submittedUrl : submittedUrl;
    const { data, error } = await supabase
      .from("Grant")
      .update({
        applicationUrl: directApplicationUrl ?? detailUrl,
        detailUrl,
        directApplicationUrl,
        applicationUrlKind: classification.kind,
        applicationUrlQuality: classification.quality,
        applicationUrlConfidence: classification.confidence,
        applicationUrlQualityReason: classification.reason,
        applicationUrlVerifiedAt: directApplicationUrl ? new Date().toISOString() : null,
        updatedAt: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id, applicationUrl, detailUrl, directApplicationUrl, applicationUrlQuality, applicationUrlKind, applicationUrlQualityReason")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Grant not found" }, { status: 404 });
    }

    if (!directApplicationUrl && classification.quality === "needs_scout") {
      await enqueueGrantForScoutIfProgrammeUrl(id).catch(() => {});
    }

    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Request failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
