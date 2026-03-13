import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { grantScanner } from "@/inngest/grant-scanner";
import { grantSync } from "@/inngest/grant-sync";
import { deadlineReminder } from "@/inngest/deadline-reminder";
import { monitorSession } from "@/inngest/monitor-session";
import { eligibilityRefresh } from "@/inngest/eligibility-refresh";
import { grantDiscovery } from "@/inngest/grant-discovery";
import { grantFormUrlScout } from "@/inngest/grant-form-url-scout";
import { grantSourceCrawler } from "@/inngest/grant-source-crawler";
import { grantDiscoveryEnqueue } from "@/inngest/grant-discovery-enqueue";
import { grantDiscoveryProcess } from "@/inngest/grant-discovery-process";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    grantScanner,
    grantSync,
    grantSourceCrawler,
    grantDiscoveryEnqueue,
    grantDiscoveryProcess,
    deadlineReminder,
    monitorSession,
    eligibilityRefresh,
    grantDiscovery,
    grantFormUrlScout,
  ],
});
