import { inngest } from "./client";
import { getDueGrantSources, runSourceAndUpsert } from "@/lib/grant-sources";

/**
 * Scheduler that runs grant sources from the registry when due.
 * Every 6 hours we query grant_sources for enabled rows where
 * last_crawled_at + crawl_frequency <= now, run each adapter, upsert grants, then update last_crawled_at.
 */
export const grantSourceCrawler = inngest.createFunction(
  { id: "grant-source-crawler", name: "Grant Source Registry Crawler" },
  { cron: "0 */6 * * *" }, // every 6 hours
  async () => {
    const due = await getDueGrantSources();
    const results: { sourceId: string; sourceName: string; synced: number; created: number; updated: number }[] = [];

    for (const source of due) {
      try {
        const { synced, created, updated } = await runSourceAndUpsert(source);
        results.push({
          sourceId: source.id,
          sourceName: source.source_name,
          synced,
          created,
          updated,
        });
      } catch (err) {
        console.error(`[grant-source-crawler] ${source.source_name} (${source.id}):`, err);
        results.push({
          sourceId: source.id,
          sourceName: source.source_name,
          synced: 0,
          created: 0,
          updated: 0,
        });
      }
    }

    return { dueCount: due.length, results };
  }
);
