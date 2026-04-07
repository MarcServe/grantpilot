import { inngest } from "./client";
import { generateAndSendDailyNewsletter } from "@/lib/newsletter-series";

export const dailyNewsletter = inngest.createFunction(
  { id: "daily-newsletter", name: "Daily public newsletter (series)" },
  { cron: "15 8 * * *" }, // 08:15 UTC daily (config is managed via env + DB recipient list)
  async () => {
    return generateAndSendDailyNewsletter({ maxGrants: 7 });
  }
);

