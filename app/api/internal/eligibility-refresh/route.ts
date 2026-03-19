import { NextResponse } from "next/server";
import { runEligibilityRefreshJob } from "@/inngest/eligibility-refresh";

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;

/**
 * POST /api/internal/eligibility-refresh
 * Manually runs eligibility scoring + notifications outside the daily cron.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const secret = req.headers.get("x-internal-secret");
  if (!INTERNAL_SECRET || secret !== INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Read body so callers can include metadata; not currently used.
    await req.text().catch(() => "");
    const result = await runEligibilityRefreshJob();
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error("[internal/eligibility-refresh]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
