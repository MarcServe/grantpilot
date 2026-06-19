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

async function callWorker(
  req: Request,
  secret: string,
  shardIndex: number,
  shardCount: number,
  limit: number
) {
  const workerBaseUrl = process.env.DEEP_SCORE_WORKER_BASE_URL?.trim() || new URL(req.url).origin;
  const workerUrl = new URL(
    "/api/cron/deep-score-queue/worker",
    workerBaseUrl
  );
  const headers: Record<string, string> = {
    authorization: `Bearer ${secret}`,
    "x-cron-secret": secret,
    "content-type": "application/json",
  };
  if (process.env.INTERNAL_API_SECRET) {
    headers["x-internal-secret"] = process.env.INTERNAL_API_SECRET;
  }

  const response = await fetch(workerUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ shardIndex, shardCount, limit }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error?: unknown }).error)
        : `Worker ${shardIndex} failed with HTTP ${response.status}`;
    throw new Error(message);
  }
  return body;
}

function workerProcessedTotals(results: Array<PromiseSettledResult<unknown>>) {
  let requested = 0;
  let completed = 0;
  let failed = 0;
  let skipped = 0;
  let highestScore = 0;
  let eligible85Plus = 0;

  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    const processed = processedRecordFromWorkerValue(result.value);
    requested += Number(processed?.requested ?? 0);
    completed += Number(processed?.completed ?? 0);
    failed += Number(processed?.failed ?? 0);
    skipped += Number(processed?.skipped ?? 0);
    highestScore = Math.max(highestScore, Number(processed?.highestScore ?? 0));
    eligible85Plus += Number(processed?.eligible85Plus ?? 0);
  }

  return { requested, completed, failed, skipped, highestScore, eligible85Plus };
}

function processedRecordFromWorkerValue(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const nested = record.processed;
  if (nested && typeof nested === "object") return nested as Record<string, unknown>;
  return record;
}

async function processShardInProcess(shardIndex: number, shardCount: number, limit: number) {
  const processed = await processEligibilityDeepScoreQueue({
    limit,
    shardCount,
    shardIndex,
    respectUsageLimits: false,
  });
  return { processed };
}

function workerResultSummaries(results: Array<PromiseSettledResult<unknown>>) {
  return results.map((worker, shardIndex) => (
    worker.status === "fulfilled"
      ? { shardIndex, status: "fulfilled", result: worker.value }
      : {
          shardIndex,
          status: "rejected",
          error: worker.reason instanceof Error ? worker.reason.message : String(worker.reason),
        }
  ));
}

/**
 * GET /api/cron/deep-score-queue
 * Vercel Cron orchestrator for converting preliminary eligibility rows into
 * trusted company-DNA AI scores. It fans out to protected shard workers so the
 * hourly job can process more rows without one long-running function doing all
 * work serially.
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
        const workerCount = positiveIntFromEnv("ELIGIBILITY_DEEP_SCORE_PARALLEL_WORKERS", 4, 10);
        const totalLimit = positiveIntFromEnv("ELIGIBILITY_DEEP_SCORE_TOTAL_BATCH_SIZE", DEEP_SCORE_BATCH_SIZE, 200);
        const configuredWorkerLimit = Number(process.env.ELIGIBILITY_DEEP_SCORE_WORKER_BATCH_SIZE);
        const workerLimit = Number.isFinite(configuredWorkerLimit) && configuredWorkerLimit > 0
          ? Math.min(100, Math.floor(configuredWorkerLimit))
          : Math.max(1, Math.ceil(totalLimit / workerCount));
        const useHttpWorkers = Boolean(process.env.DEEP_SCORE_WORKER_BASE_URL?.trim());
        const enqueued = await enqueueExistingHeuristicAssessments({
          limit: enqueueLimit,
          minScore: minScoreFromEnv(),
        });

        if (workerCount <= 1) {
          const processed = await processEligibilityDeepScoreQueue({
            limit: workerLimit,
            respectUsageLimits: false,
          });
          return { enqueued, mode: "single-worker", workerCount, workerLimit, processed };
        }

        const workerResults = await Promise.allSettled(
          Array.from({ length: workerCount }, (_, shardIndex) =>
            useHttpWorkers
              ? callWorker(req, secret, shardIndex, workerCount, workerLimit)
              : processShardInProcess(shardIndex, workerCount, workerLimit)
          )
        );
        const failedWorkers = workerResults.filter((worker) => worker.status === "rejected");
        if (failedWorkers.length === workerResults.length) {
          const firstFailure = failedWorkers[0] as PromiseRejectedResult | undefined;
          const fallbackReason =
            firstFailure?.reason instanceof Error ? firstFailure.reason.message : "All deep-score workers failed";
          const processed = await processEligibilityDeepScoreQueue({
            limit: workerLimit,
            respectUsageLimits: false,
          });
          return {
            enqueued,
            mode: "single-worker-fallback",
            fallbackReason,
            workerCount,
            workerLimit,
            useHttpWorkers,
            processed,
            workers: workerResultSummaries(workerResults),
          };
        }

        return {
          enqueued,
          mode: useHttpWorkers ? "parallel-http-workers" : "parallel-in-process-workers",
          workerCount,
          workerLimit,
          useHttpWorkers,
          processed: workerProcessedTotals(workerResults),
          workers: workerResultSummaries(workerResults),
        };
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
