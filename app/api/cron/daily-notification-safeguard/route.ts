import { NextResponse } from "next/server";
import { enqueueDailyEligibilityDigests, runDailyNotificationSafeguardJob } from "@/inngest/daily-notification-safeguard";
import { runWithCronLog } from "@/lib/cron-run-log";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const INLINE_FALLBACK_MAX_ORGS = positiveIntFromEnv("DAILY_DIGEST_INLINE_FALLBACK_MAX_ORGS", 25);

function positiveIntFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

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

    let inlineFallback = null;
    if (result.enqueued > 0 && result.enqueued <= INLINE_FALLBACK_MAX_ORGS) {
      inlineFallback = await runWithCronLog(
        {
          jobName: "Daily Eligibility Digest Inline Fallback",
          route: "/api/cron/daily-notification-safeguard:inline",
          trigger: "vercel",
        },
        () => runDailyNotificationSafeguardJob({
          respectLocalTime: true,
          checkedGrantsCountOverride: result.checkedGrantsCount,
        })
      );
    }

    return NextResponse.json({ ok: true, result, inlineFallback });
  } catch (error) {
    console.error("[cron/daily-notification-safeguard]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Daily notification safeguard failed" },
      { status: 500 }
    );
  }
}
