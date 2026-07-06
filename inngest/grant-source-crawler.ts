import { inngest } from "./client";
import { enqueueDueGrantSourceRuns, runClaimedGrantSource } from "@/lib/grant-sources";
import { runWithCronLog } from "@/lib/cron-run-log";

/**
 * Scheduler only claims and enqueues due grant sources. The actual crawl work is
 * one source per worker event so long source lists cannot timeout a cron route.
 */
export const grantSourceCrawler = inngest.createFunction(
  { id: "grant-source-crawler", name: "Grant Source Registry Crawler Enqueue" },
  { cron: "0 */6 * * *" },
  async () =>
    runWithCronLog(
      { jobName: "Grant Source Registry Crawler Enqueue", route: "inngest/grant-source-crawler", trigger: "inngest" },
      () => enqueueDueGrantSourceRuns({ source: "inngest.cron.grant-source-crawler" })
    )
);

export const grantSourceRunRequested = inngest.createFunction(
  { id: "grant-source-run-requested", name: "Grant Source Registry Source Worker" },
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
