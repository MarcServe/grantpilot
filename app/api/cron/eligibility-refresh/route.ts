import { NextResponse } from "next/server";
import { runEligibilityRefreshJob } from "@/inngest/eligibility-refresh";
import { runWithCronLog } from "@/lib/cron-run-log";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/eligibility-refresh
 * Runs the OpenAI eligibility checking funnel after new grants are discovered.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runWithCronLog(
      { jobName: "Eligibility Refresh", route: "/api/cron/eligibility-refresh", trigger: "vercel" },
      () => runEligibilityRefreshJob()
    );
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("[cron/eligibility-refresh]", error);
    return NextResponse.json({ error: "Eligibility refresh failed" }, { status: 500 });
  }
}
