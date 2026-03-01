import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { grantScanner } from "@/inngest/grant-scanner";
import { grantSync } from "@/inngest/grant-sync";
import { deadlineReminder } from "@/inngest/deadline-reminder";
import { monitorSession } from "@/inngest/monitor-session";
import { eligibilityRefresh } from "@/inngest/eligibility-refresh";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [grantScanner, grantSync, deadlineReminder, monitorSession, eligibilityRefresh],
});
