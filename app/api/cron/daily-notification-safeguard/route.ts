import { NextResponse } from "next/server";
import { enqueueDailyEligibilityDigests } from "@/inngest/daily-notification-safeguard";
import { runWithCronLog } from "@/lib/cron-run-log";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/daily-notification-safeguard
 * Lightweight safety net: enqueue one morning digest sender per organisation.
 * Each worker reads cached eligibility rows instead of running AI scoring.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runWithCronLog(
      {
        jobName: "Daily Eligibility Digest Enqueue",
        route: "/api/cron/daily-notification-safeguard",
        trigger: "vercel",
      },
      () => enqueueDailyEligibilityDigests({
        source: "vercel.cron.daily_digest",
        respectLocalTime: true,
      })
    );
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("[cron/daily-notification-safeguard]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Daily notification safeguard failed" },
      { status: 500 }
    );
  }
}
