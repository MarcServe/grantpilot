import { inngest } from "./client";
import { syncGrantsFromFeed } from "@/lib/grants-ingest";

/**
 * Daily sync of grants from GRANTS_FEED_URL (if set).
 * In production, set GRANTS_FEED_URL to a JSON feed of grant opportunities.
 */
export const grantSync = inngest.createFunction(
  { id: "grant-sync", name: "Grant Feed Sync" },
  { cron: "0 3 * * *" },
  async () => {
    const result = await syncGrantsFromFeed();
    return result;
  }
);
