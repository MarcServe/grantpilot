import { inngest } from "./client";
import { syncGrantsFromGrantsGov } from "@/lib/grants-ingest";
import { runWithCronLog } from "@/lib/cron-run-log";

/**
 * US federal grants only — official Grants.gov API (no Apify). Runs daily.
 *
 * UK/EU/360Giving JSON feed syncs are disabled: they produced many dead URLs.
 * Multi-region discovery uses AI web search (grant-discovery Inngest job).
 */
export const grantSync = inngest.createFunction(
  { id: "grant-sync", name: "Grants.gov federal sync (US only)" },
  { cron: "0 6 * * *" },
  async () => runWithCronLog({ jobName: "Grants.gov federal sync", route: "inngest/grant-sync", trigger: "inngest" }, async () => {
    const govResult = await syncGrantsFromGrantsGov(500);
    return {
      grantsGov: govResult,
      totalSynced: govResult.synced,
      message: "UK/EU/feed syncs disabled; use grant-discovery for web search",
    };
  })
);
