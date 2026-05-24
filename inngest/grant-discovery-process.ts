/**
 * Process grant_discovery_queue: fetch pending URLs, classify, extract grants, upsert, mark crawled.
 */

import { inngest } from "./client";
import { processGrantDiscoveryQueue } from "@/lib/grant-discovery-processor";
import { runWithCronLog } from "@/lib/cron-run-log";

const BATCH_SIZE = 30;

export const grantDiscoveryProcess = inngest.createFunction(
  { id: "grant-discovery-process", name: "Grant Discovery Queue Processor" },
  { cron: "0 */12 * * *" }, // every 12 hours
  async () => runWithCronLog(
    { jobName: "Grant Discovery Queue Processor", route: "inngest/grant-discovery-process", trigger: "inngest" },
    () => processGrantDiscoveryQueue(BATCH_SIZE)
  )
);
