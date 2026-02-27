import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { grantScanner } from "@/inngest/grant-scanner";
import { deadlineReminder } from "@/inngest/deadline-reminder";
import { monitorSession } from "@/inngest/monitor-session";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [grantScanner, deadlineReminder, monitorSession],
});
