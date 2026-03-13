/**
 * Process grant_discovery_queue: fetch pending URLs, classify, extract grants, upsert, mark crawled.
 * Throttles per domain and respects robots.txt (via grants-crawl).
 */

import { inngest } from "./client";
import {
  getPendingDiscoveryUrls,
  markDiscoveryCrawled,
  markDiscoveryFailed,
} from "@/lib/grant-discovery-queue";
import { fetchGrantsFromCrawl } from "@/lib/grants-crawl";
import { upsertGrant } from "@/lib/grants-ingest";
import { waitForDomainThrottle } from "@/lib/throttle-per-domain";

const BATCH_SIZE = 30;

export const grantDiscoveryProcess = inngest.createFunction(
  { id: "grant-discovery-process", name: "Grant Discovery Queue Processor" },
  { cron: "0 */12 * * *" }, // every 12 hours
  async () => {
    const pending = await getPendingDiscoveryUrls(BATCH_SIZE);
    const results: { id: string; url: string; status: string; grants: number }[] = [];

    for (const row of pending) {
      try {
        await waitForDomainThrottle(row.url);
        const { grants } = await fetchGrantsFromCrawl(row.url, row.source ?? "discovery", {
          skipClassifier: false,
        });
        let created = 0;
        let updated = 0;
        for (const g of grants) {
          try {
            const { created: c } = await upsertGrant(g);
            if (c) created++;
            else updated++;
          } catch {
            /* skip single grant */
          }
        }
        await markDiscoveryCrawled(row.id);
        results.push({
          id: row.id,
          url: row.url,
          status: "crawled",
          grants: grants.length,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await markDiscoveryFailed(row.id, msg);
        results.push({
          id: row.id,
          url: row.url,
          status: "failed",
          grants: 0,
        });
      }
    }

    return { processed: pending.length, results };
  }
);
