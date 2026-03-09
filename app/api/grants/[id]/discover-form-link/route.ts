import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isLikelyProgrammeInfoUrl } from "@/lib/grant-url-validation";
import { discoverFormLink } from "@/lib/grant-form-link-discovery";

/**
 * GET /api/grants/[id]/discover-form-link
 * Fetches the grant's applicationUrl; if it looks like a programme/info page,
 * crawls it to find the direct application form link (e.g. Airtable form).
 * Returns { formUrl: string | null, currentUrl, error? }.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await getActiveOrg();
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Grant ID required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: grant, error } = await supabase
      .from("Grant")
      .select("id, applicationUrl")
      .eq("id", id)
      .single();

    if (error || !grant) {
      return NextResponse.json({ error: "Grant not found" }, { status: 404 });
    }

    const currentUrl = (grant as { applicationUrl?: string }).applicationUrl ?? "";
    if (!currentUrl) {
      return NextResponse.json({ formUrl: null, currentUrl: "", error: "No URL to crawl" }, { status: 400 });
    }

    if (!isLikelyProgrammeInfoUrl(currentUrl)) {
      return NextResponse.json({
        formUrl: null,
        currentUrl,
        message: "URL does not look like a programme page; no crawl needed.",
      });
    }

    const { formUrl, error: crawlError } = await discoverFormLink(currentUrl);
    return NextResponse.json({
      formUrl,
      currentUrl,
      ...(crawlError && { error: crawlError }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Request failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
