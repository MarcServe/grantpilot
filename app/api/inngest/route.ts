import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { grantSync, grantSyncGrantsGovPageRequested, grantSyncSourceRequested } from "@/inngest/grant-sync";
import { deadlineReminder } from "@/inngest/deadline-reminder";
import { outcomeFeedbackReminder } from "@/inngest/outcome-feedback-reminder";
import { monitorSession } from "@/inngest/monitor-session";
import {
  eligibilityDeepScoreProcessRequested,
  eligibilityRefresh,
  eligibilityRefreshEnqueueRequested,
  eligibilityRefreshRequested,
} from "@/inngest/eligibility-refresh";
import { grantDiscovery } from "@/inngest/grant-discovery";
import { grantFormUrlScout } from "@/inngest/grant-form-url-scout";
import { grantSourceCrawler, grantSourceRunRequested } from "@/inngest/grant-source-crawler";
import { grantDiscoveryEnqueue } from "@/inngest/grant-discovery-enqueue";
import { grantDiscoveryProcess } from "@/inngest/grant-discovery-process";
import { grantUrlHealthSweep } from "@/inngest/grant-url-health-sweep";
import { dailyNotificationDigestRequested, dailyNotificationSafeguard } from "@/inngest/daily-notification-safeguard";
import { grantPostprocessRequested } from "@/inngest/grant-postprocess";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    grantSync,
    grantSyncSourceRequested,
    grantSyncGrantsGovPageRequested,
    grantSourceCrawler,
    grantSourceRunRequested,
    grantDiscoveryEnqueue,
    grantDiscoveryProcess,
    deadlineReminder,
    outcomeFeedbackReminder,
    monitorSession,
    eligibilityRefresh,
    eligibilityRefreshEnqueueRequested,
    eligibilityRefreshRequested,
    eligibilityDeepScoreProcessRequested,
    grantDiscovery,
    grantFormUrlScout,
    grantUrlHealthSweep,
    grantPostprocessRequested,
    dailyNotificationSafeguard,
    dailyNotificationDigestRequested,
  ],
});
