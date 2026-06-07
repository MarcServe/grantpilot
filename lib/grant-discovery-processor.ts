/**
 * Process pending discovery URLs from sitemap/RSS/search enqueue jobs.
 */

import {
  getPendingDiscoveryUrls,
  markDiscoveryCrawled,
  markDiscoveryFailed,
} from "@/lib/grant-discovery-queue";
import { fetchGrantsFromCrawl } from "@/lib/grants-crawl";
import { upsertGrant } from "@/lib/grants-ingest";
import { waitForDomainThrottle } from "@/lib/throttle-per-domain";
import { isPdfUrl } from "@/lib/grant-url-validation";

const DEFAULT_BATCH_SIZE = 30;

export async function processGrantDiscoveryQueue(batchSize = DEFAULT_BATCH_SIZE): Promise<{
  processed: number;
  created: number;
  updated: number;
  failed: number;
  results: { id: string; url: string; status: string; grants: number; created: number; updated: number; error?: string }[];
}> {
  const pending = await getPendingDiscoveryUrls(batchSize);
  const results: { id: string; url: string; status: string; grants: number; created: number; updated: number; error?: string }[] = [];
  let totalCreated = 0;
  let totalUpdated = 0;
  let failed = 0;

  for (const row of pending) {
    try {
      if (isPdfUrl(row.url)) {
        const error = "PDF extraction not yet implemented";
        await markDiscoveryFailed(row.id, error);
        failed++;
        results.push({ id: row.id, url: row.url, status: "failed", grants: 0, created: 0, updated: 0, error });
        continue;
      }

      await waitForDomainThrottle(row.url);
      const { grants } = await fetchGrantsFromCrawl(row.url, row.source ?? "discovery", {
        skipClassifier: false,
      });
      let created = 0;
      let updated = 0;
      for (const grant of grants) {
        try {
          const { created: didCreate } = await upsertGrant(grant);
          if (didCreate) created++;
          else updated++;
        } catch {
          /* skip single grant */
        }
      }
      totalCreated += created;
      totalUpdated += updated;
      await markDiscoveryCrawled(row.id);
      results.push({
        id: row.id,
        url: row.url,
        status: "crawled",
        grants: grants.length,
        created,
        updated,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await markDiscoveryFailed(row.id, message);
      failed++;
      results.push({
        id: row.id,
        url: row.url,
        status: "failed",
        grants: 0,
        created: 0,
        updated: 0,
        error: message,
      });
    }
  }

  return {
    processed: pending.length,
    created: totalCreated,
    updated: totalUpdated,
    failed,
    results,
  };
}
