/**
 * Process grant_discovery_queue: fetch pending URLs, classify, extract grants, upsert, mark crawled.
 */

import { inngest } from "./client";
import { processGrantDiscoveryQueue } from "@/lib/grant-discovery-processor";

const BATCH_SIZE = 30;

export const grantDiscoveryProcess = inngest.createFunction(
  { id: "grant-discovery-process", name: "Grant Discovery Queue Processor" },
  { cron: "0 */12 * * *" }, // every 12 hours
  async () => processGrantDiscoveryQueue(BATCH_SIZE)
);
