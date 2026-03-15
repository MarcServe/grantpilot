import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isLikelyProgrammeInfoUrl } from "@/lib/grant-url-validation";

type GrantLinkRow = {
  status: string;
  application_form_url: string | null;
  error_message: string | null;
};

/**
 * POST /api/grants/[id]/scout-form-link
 * Enqueue a Scout job so the worker (Playwright) finds the application form URL.
 * The worker picks up grant_links rows with status=pending and updates Grant.applicationUrl on success.
 * Returns { status, formUrl? } so the client can poll GET until status is terminal.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await getActiveOrg();
    const { id: grantId } = await params;
    if (!grantId) {
      return NextResponse.json({ error: "Grant ID required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: grant, error: grantError } = await supabase
      .from("Grant")
      .select("id, name, funder, amount, deadline, applicationUrl")
      .eq("id", grantId)
      .single();

    if (grantError || !grant) {
      return NextResponse.json({ error: "Grant not found" }, { status: 404 });
    }

    const applicationUrl = (grant as { applicationUrl?: string }).applicationUrl?.trim() ?? "";
    if (!applicationUrl) {
      return NextResponse.json({ error: "Grant has no application URL" }, { status: 400 });
    }

    if (!isLikelyProgrammeInfoUrl(applicationUrl)) {
      return NextResponse.json({
        status: "skipped",
        message: "URL does not look like a programme page; Scout is for programme pages only.",
      });
    }

    const { data: existing } = await supabase
      .from("grant_links")
      .select("status, application_form_url")
      .eq("grant_id", grantId)
      .maybeSingle();

    const row = existing as GrantLinkRow | null;
    if (row?.status === "found" && row.application_form_url) {
      return NextResponse.json({ status: "found", formUrl: row.application_form_url });
    }
    if (row?.status === "running") {
      return NextResponse.json({ status: "running", message: "Scout is already running for this grant." });
    }

    const { error: upsertError } = await supabase.from("grant_links").upsert(
      {
        grant_id: grantId,
        homepage_url: applicationUrl,
        grant_name: (grant as { name?: string }).name ?? null,
        funder: (grant as { funder?: string }).funder ?? null,
        amount: (grant as { amount?: number }).amount != null ? String((grant as { amount?: number }).amount) : null,
        deadline: (grant as { deadline?: string }).deadline ?? null,
        status: "pending",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "grant_id", ignoreDuplicates: false }
    );

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    return NextResponse.json({ status: "pending", message: "Scout enqueued. Worker will discover the form link." });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Request failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * GET /api/grants/[id]/scout-form-link
 * Poll for Scout result. Returns current status and formUrl when status is "found".
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await getActiveOrg();
    const { id: grantId } = await params;
    if (!grantId) {
      return NextResponse.json({ error: "Grant ID required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: row, error } = await supabase
      .from("grant_links")
      .select("status, application_form_url, error_message")
      .eq("grant_id", grantId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const r = row as GrantLinkRow | null;
    if (!r) {
      return NextResponse.json({ status: "none", message: "No Scout job for this grant." });
    }

    return NextResponse.json({
      status: r.status,
      formUrl: r.application_form_url ?? undefined,
      error: r.error_message ?? undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Request failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
