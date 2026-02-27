import { inngest } from "./client";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdmin } from "@/lib/supabase";
import { notifyOrgMembers } from "@/lib/notify";

export const monitorSession = inngest.createFunction(
  { id: "monitor-session", name: "Monitor Execution Session" },
  { event: "app/session.started" },
  async ({ event, step }) => {
    const { applicationId, sessionPublicId } = event.data as {
      applicationId: string;
      sessionPublicId: string;
    };

    for (let attempt = 0; attempt < 60; attempt++) {
      await step.sleep(`check-${attempt}`, "5m");

      const supabase = getSupabaseAdmin();

      const session = await step.run(`fetch-session-${attempt}`, async () => {
        const { data } = await supabase
          .from("cu_sessions")
          .select("status, updated_at")
          .eq("public_id", sessionPublicId)
          .single();
        return data as { status: string; updated_at: string } | null;
      });

      if (!session) break;

      if (session.status === "completed" || session.status === "failed") {
        const application = await step.run("update-application", async () => {
          return prisma.application.update({
            where: { id: applicationId },
            data: {
              status: session.status === "completed" ? "REVIEW_REQUIRED" : "FAILED",
            },
            include: { grant: true },
          });
        });

        const notificationType =
          session.status === "completed" ? "review_required" : "application_failed";

        await step.run("send-notification", async () => {
          await notifyOrgMembers(
            application.organisationId,
            notificationType as "review_required" | "application_failed",
            {
              grantName: application.grant.name,
              applicationId: application.id,
            }
          );
        });

        return { status: session.status, attempts: attempt + 1 };
      }

      const updatedAt = new Date(session.updated_at);
      const staleMinutes = (Date.now() - updatedAt.getTime()) / 60000;

      if (staleMinutes > 30) {
        await step.run("mark-stale-failed", async () => {
          await supabase
            .from("cu_sessions")
            .update({ status: "failed", error_log: "Session timed out (no activity for 30 minutes)" })
            .eq("public_id", sessionPublicId);

          const app = await prisma.application.update({
            where: { id: applicationId },
            data: { status: "FAILED" },
            include: { grant: true },
          });

          await notifyOrgMembers(app.organisationId, "application_failed", {
            grantName: app.grant.name,
            applicationId: app.id,
          });
        });

        return { status: "timed_out", attempts: attempt + 1 };
      }
    }

    return { status: "max_attempts_reached" };
  }
);
