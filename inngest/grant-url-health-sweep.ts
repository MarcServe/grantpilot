import { inngest } from "./client";
import { sweepGrantUrls } from "@/lib/url-health-check";

/**
 * Daily sweep: re-check grant URLs that haven't been verified in 7+ days.
 * Runs at 5:00 UTC — after grant sync (3:00) and scout enqueue (2:00).
 * Processes up to 100 grants per run to stay within rate limits.
 */
export const grantUrlHealthSweep = inngest.createFunction(
  { id: "grant-url-health-sweep", name: "Daily Grant URL Health Sweep" },
  { cron: "0 5 * * *" },
  async () => {
    const stats = await sweepGrantUrls(7, 100);
    console.log("[url-health-sweep]", stats);
    return stats;
  }
);
