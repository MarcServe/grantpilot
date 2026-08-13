import { NextResponse } from "next/server";
import { enqueueDueGrantSourceRuns, runDueGrantSources } from "@/lib/grant-sources";
import { runWithCronLog } from "@/lib/cron-run-log";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function cronLimit(): number {
  const raw = Number(process.env.GRANT_SOURCE_CRON_LIMIT ?? 20);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 20;
}

function cronInlineWorkerLimit(): number {
  const raw = Number(process.env.GRANT_SOURCE_CRON_INLINE_WORKER_LIMIT ?? 3);
  if (!Number.isFinite(raw)) return 3;
  return Math.max(0, Math.min(5, Math.floor(raw)));
}

/**
 * GET /api/cron/grant-source-crawler
 * Vercel Cron fallback for the grant_sources registry used by RSS/crawl links.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runWithCronLog(
      { jobName: "Grant Source Registry Crawler Enqueue", route: "/api/cron/grant-source-crawler", trigger: "vercel" },
      async () => {
        const enqueue = await enqueueDueGrantSourceRuns({ limit: cronLimit(), source: "vercel.cron.grant-source-crawler" });
        const inlineWorkerLimit = cronInlineWorkerLimit();
        const inlineProcessed = inlineWorkerLimit > 0
          ? await runDueGrantSources({ limit: inlineWorkerLimit, skipAutoSeed: true })
          : null;
        return {
          ...enqueue,
          inlineWorkerLimit,
          inlineProcessed,
        };
      }
    );
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("[cron/grant-source-crawler]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Grant source crawl failed" },
      { status: 500 }
    );
  }
}
