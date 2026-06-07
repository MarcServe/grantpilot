import { NextResponse } from "next/server";
import { runDailyNotificationSafeguardJob } from "@/inngest/daily-notification-safeguard";
import { runWithCronLog } from "@/lib/cron-run-log";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/daily-notification-safeguard
 * Lightweight safety net: if the heavier scoring/reminder jobs did not deliver an
 * eligibility-facing email this morning, send a daily update or upgrade prompt.
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
        jobName: "Daily Notification Safeguard",
        route: "/api/cron/daily-notification-safeguard",
        trigger: "vercel",
      },
      () => runDailyNotificationSafeguardJob({ respectLocalTime: true })
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
