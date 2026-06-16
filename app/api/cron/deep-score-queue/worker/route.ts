import { NextResponse } from "next/server";
import { runWithCronLog } from "@/lib/cron-run-log";
import {
  DEEP_SCORE_BATCH_SIZE,
  processEligibilityDeepScoreQueue,
} from "@/lib/eligibility-deep-score-queue";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function boundedInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

/**
 * POST /api/cron/deep-score-queue/worker
 * Protected shard worker called by /api/cron/deep-score-queue. Each worker
 * claims rows atomically from eligibility_deep_score_queue, scoped by shard.
 */
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const shardCount = boundedInt(body?.shardCount, 1, 1, 20);
    const shardIndex = boundedInt(body?.shardIndex, 0, 0, shardCount - 1);
    const limit = boundedInt(body?.limit, DEEP_SCORE_BATCH_SIZE, 1, 100);

    const processed = await runWithCronLog(
      {
        jobName: "Eligibility Deep Score Worker",
        route: `/api/cron/deep-score-queue/worker/${shardIndex}-of-${shardCount}`,
        trigger: "vercel",
      },
      () => processEligibilityDeepScoreQueue({
        limit,
        shardCount,
        shardIndex,
        respectUsageLimits: false,
      })
    );

    return NextResponse.json({
      ok: true,
      shardCount,
      shardIndex,
      limit,
      processed,
    });
  } catch (error) {
    console.error("[cron/deep-score-queue/worker]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Deep-score worker failed" },
      { status: 500 }
    );
  }
}
