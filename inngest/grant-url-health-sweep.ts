import { inngest } from "./client";
import { sweepGrantUrls } from "@/lib/url-health-check";

/**
 * Daily sweep: re-check grant URLs that haven't been verified recently.
 * Runs at 2:00 UTC — before eligibility scoring (3:00) so broken links
 * are flagged before notifications go out.
 * Processes up to 100 grants per run to stay within rate limits.
 */
export const grantUrlHealthSweep = inngest.createFunction(
  { id: "grant-url-health-sweep", name: "Daily Grant URL Health Sweep" },
  { cron: "0 2 * * *" },
  async () => {
    const stats = await sweepGrantUrls(7, 100);
    console.log("[url-health-sweep]", stats);
    return stats;
  }
);
