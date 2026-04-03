import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { runEligibilityRefreshJob } from "@/inngest/eligibility-refresh";

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;

/**
 * POST /api/internal/eligibility-refresh
 * Manually runs eligibility scoring + notifications outside the daily cron.
 * Pass ?reset=true to clear notification and score caches first.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const secret = req.headers.get("x-internal-secret");
  if (!INTERNAL_SECRET || secret !== INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await req.text().catch(() => "");

    const url = new URL(req.url);
    if (url.searchParams.get("reset") === "true") {
      const supabase = getSupabaseAdmin();
      const staleDate = new Date(0).toISOString();
      await supabase
        .from("EligibilityAssessment")
        .update({ notified_at: null, updated_at: staleDate })
        .neq("organisation_id", "");
      console.info("[internal/eligibility-refresh] Reset all caches and notification timestamps");
    }

    const result = await runEligibilityRefreshJob();
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error("[internal/eligibility-refresh]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
