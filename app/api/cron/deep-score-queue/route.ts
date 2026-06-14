import { NextResponse } from "next/server";
import { runWithCronLog } from "@/lib/cron-run-log";
import {
  DEEP_SCORE_BATCH_SIZE,
  enqueueExistingHeuristicAssessments,
  processEligibilityDeepScoreQueue,
} from "@/lib/eligibility-deep-score-queue";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function positiveIntFromEnv(name: string, fallback: number, max: number): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(max, Math.floor(value));
}

function minScoreFromEnv(): number {
  const value = Number(process.env.ELIGIBILITY_DEEP_SCORE_QUEUE_MIN_SCORE);
  if (!Number.isFinite(value)) return 40;
  return Math.max(0, Math.min(100, Math.floor(value)));
}

/**
 * GET /api/cron/deep-score-queue
 * Vercel Cron worker for converting preliminary eligibility rows into trusted
 * company-DNA AI scores. This is intentionally separate from the all-org
 * eligibility refresh so one hourly request only processes a bounded batch.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runWithCronLog(
      { jobName: "Eligibility Deep Score Queue", route: "/api/cron/deep-score-queue", trigger: "vercel" },
      async () => {
        const enqueueLimit = positiveIntFromEnv("ELIGIBILITY_DEEP_SCORE_QUEUE_ENQUEUE_LIMIT", 500, 1000);
        const enqueued = await enqueueExistingHeuristicAssessments({
          limit: enqueueLimit,
          minScore: minScoreFromEnv(),
        });
        const processed = await processEligibilityDeepScoreQueue({
          limit: DEEP_SCORE_BATCH_SIZE,
          respectUsageLimits: false,
        });
        return { enqueued, processed };
      }
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron/deep-score-queue]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Deep-score queue failed" },
      { status: 500 }
    );
  }
}
