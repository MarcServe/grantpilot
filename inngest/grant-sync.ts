import { inngest } from "./client";
import {
  enqueueGrantSync,
  processGrantSyncSource,
  processGrantsGovPage,
  type GrantSyncSource,
} from "@/lib/grant-sync-jobs";
import { runWithCronLog } from "@/lib/cron-run-log";

function parseSource(value: unknown): GrantSyncSource {
  if (value === "feed" || value === "uk" || value === "eu") return value;
  throw new Error(`Unsupported grant sync source: ${String(value)}`);
}

/**
 * Daily scheduler only enqueues bounded grant sync workers. Actual work happens
 * in one-source/page worker events to keep serverless invocations short.
 */
export const grantSync = inngest.createFunction(
  { id: "grant-sync", name: "Grant Sync Enqueue" },
  { cron: "0 6 * * *" },
  async () =>
    runWithCronLog(
      { jobName: "Grant Sync Enqueue", route: "inngest/grant-sync", trigger: "inngest" },
      async () => enqueueGrantSync({ source: "inngest.cron.grant-sync" })
    )
);

export const grantSyncSourceRequested = inngest.createFunction(
  { id: "grant-sync-source-requested", name: "Grant Sync Source Worker" },
  { event: "grant-sync/source.requested" },
  async ({ event }) =>
    runWithCronLog(
      { jobName: "Grant Sync Source Worker", route: "inngest/grant-sync.source", trigger: "inngest" },
      async () => processGrantSyncSource(parseSource(event.data?.source))
    )
);

export const grantSyncGrantsGovPageRequested = inngest.createFunction(
  { id: "grant-sync-grants-gov-page-requested", name: "Grant Sync Grants.gov Page Worker" },
  { event: "grant-sync/grants-gov-page.requested" },
  async ({ event }) =>
    runWithCronLog(
      { jobName: "Grant Sync Grants.gov Page Worker", route: "inngest/grant-sync.grants-gov-page", trigger: "inngest" },
      async () =>
        processGrantsGovPage({
          startRecord: event.data?.startRecord,
          rows: event.data?.rows,
          maxTotal: event.data?.maxTotal,
          batchKey: typeof event.data?.batchKey === "string" ? event.data.batchKey : undefined,
        })
    )
);
