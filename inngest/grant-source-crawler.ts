import { inngest } from "./client";
import { runDueGrantSources } from "@/lib/grant-sources";

/**
 * Scheduler that runs grant sources from the registry when due.
 * Every 6 hours we query grant_sources for enabled rows where
 * last_crawled_at + crawl_frequency <= now, run each adapter, upsert grants, then update last_crawled_at.
 */
export const grantSourceCrawler = inngest.createFunction(
  { id: "grant-source-crawler", name: "Grant Source Registry Crawler" },
  { cron: "0 */6 * * *" }, // every 6 hours
  async () => runDueGrantSources()
);
