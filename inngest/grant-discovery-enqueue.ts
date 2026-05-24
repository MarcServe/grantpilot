/**
 * Discovery enqueue job: sitemap + RSS discovery to populate grant_discovery_queue.
 */

import { inngest } from "./client";
import { runDiscoveryEnqueue } from "@/lib/grant-discovery-enqueue";
import { runWithCronLog } from "@/lib/cron-run-log";

export const grantDiscoveryEnqueue = inngest.createFunction(
  { id: "grant-discovery-enqueue", name: "Grant Discovery Enqueue" },
  { cron: "30 */12 * * *" }, // every 12 hours, 30 min offset from processor
  async () => runWithCronLog({ jobName: "Grant Discovery Enqueue", route: "inngest/grant-discovery-enqueue", trigger: "inngest" }, async () => {
    const { enqueued } = await runDiscoveryEnqueue();
    return { enqueued };
  })
);
