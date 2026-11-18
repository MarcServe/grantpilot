import { sourceEnqueueLimit, sourceWorkerConcurrency } from "@/lib/source-crawler-config";
import { inngest } from "./client";
import { enqueueDueGrantSourceRuns, runClaimedGrantSource, runDueGrantSources } from "@/lib/grant-sources";
import { runWithCronLog } from "@/lib/cron-run-log";

function crawlerInlineWorkerLimit(): number {
  const raw = Number(process.env.GRANT_SOURCE_CRAWLER_INLINE_WORKER_LIMIT ?? 2);
  if (!Number.isFinite(raw)) return 2;
  return Math.max(0, Math.min(5, Math.floor(raw)));
}

/**
 * Scheduler only claims and enqueues due grant sources. The actual crawl work is
 * one source per worker event so long source lists cannot timeout a cron route.
 */
export const grantSourceCrawler = inngest.createFunction(
  { id: "grant-source-crawler", name: "Grant Source Registry Crawler Enqueue" },
  { cron: "30 * * * *" },
  async () =>
    runWithCronLog(
      { jobName: "Grant Source Registry Crawler Enqueue", route: "inngest/grant-source-crawler", trigger: "inngest" },
      async () => {
        const enqueue = await enqueueDueGrantSourceRuns({ limit: sourceEnqueueLimit(process.env.GRANT_SOURCE_CRON_LIMIT), source: "inngest.cron.grant-source-crawler" });
        const inlineWorkerLimit = crawlerInlineWorkerLimit();
        const inlineProcessed = inlineWorkerLimit > 0
          ? await runDueGrantSources({ limit: inlineWorkerLimit, skipAutoSeed: true })
          : null;
        return {
          ...enqueue,
          inlineWorkerLimit,
          inlineProcessed,
        };
      }
    )
);

export const grantSourceRunRequested = inngest.createFunction(
  { id: "grant-source-run-requested", name: "Grant Source Registry Source Worker", concurrency: [{ limit: sourceWorkerConcurrency(process.env.GRANT_SOURCE_WORKER_CONCURRENCY) }, { limit: 1, key: "event.data.sourceDomain" }] },
  { event: "grant-source/run.requested" },
  async ({ event }) =>
    runWithCronLog(
      { jobName: "Grant Source Registry Source Worker", route: "inngest/grant-source.run", trigger: "inngest" },
      () =>
        runClaimedGrantSource({
          sourceId: String(event.data?.sourceId ?? ""),
          claimToken: typeof event.data?.claimToken === "string" ? event.data.claimToken : null,
        })
    )
);
