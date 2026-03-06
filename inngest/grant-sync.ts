import { inngest } from "./client";
import {
  syncGrantsFromFeed,
  syncGrantsFromGrantsGov,
  syncGrantsFromUK,
  syncGrantsFromEU,
} from "@/lib/grants-ingest";

/**
 * Daily sync of grants from multiple sources (UK, EU, USA, and optional custom feed).
 * - GRANTS_FEED_URL: optional custom JSON feed
 * - Grants.gov: up to 500 US federal opportunities (no API key)
 * - UK: up to 500 from 360Giving API (live, daily-updated); fallback to curated list
 * - EU: up to 500 from EU_GRANTS_FEED_URL when set; otherwise curated list (76+ programmes)
 */
export const grantSync = inngest.createFunction(
  { id: "grant-sync", name: "Grant Feed Sync" },
  { cron: "0 6 * * *" }, // 6:00 UTC — sync grant data first so downstream jobs have fresh data
  async () => {
    const feedResult = await syncGrantsFromFeed();
    const govResult = await syncGrantsFromGrantsGov(500);
    const ukResult = await syncGrantsFromUK();
    const euResult = await syncGrantsFromEU();
    const totalSynced = feedResult.synced + govResult.synced + ukResult.synced + euResult.synced;
    return {
      feed: feedResult,
      grantsGov: govResult,
      uk: ukResult,
      eu: euResult,
      totalSynced,
    };
  }
);
