import { inngest } from "./client";
import { getSupabaseAdmin } from "@/lib/supabase";
import { notifyOrgMembers } from "@/lib/notify";
import { createApproveToken } from "@/lib/approve-token";

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
          const status = session.status === "completed" ? "REVIEW_REQUIRED" : "FAILED";
          await supabase
            .from("Application")
            .update({ status })
            .eq("id", applicationId);
          const { data } = await supabase
            .from("Application")
            .select("id, organisationId, Grant(name)")
            .eq("id", applicationId)
            .single();
          return data as unknown as { id: string; organisationId: string; Grant: { name: string } };
        });

        const notificationType =
          session.status === "completed" ? "review_required" : "application_failed";
        const grantName = application?.Grant?.name ?? "Grant";
        const approveToken = session.status === "completed" ? createApproveToken(application!.id) : undefined;

        await step.run("send-notification", async () => {
          await notifyOrgMembers(
            application!.organisationId,
            notificationType as "review_required" | "application_failed",
            {
              grantName,
              applicationId: application!.id,
              approveToken,
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

          await supabase
            .from("Application")
            .update({ status: "FAILED" })
            .eq("id", applicationId);

          const { data: app } = await supabase
            .from("Application")
            .select("id, organisationId, Grant(name)")
            .eq("id", applicationId)
            .single();

          const grantObj = (app as { Grant?: { name: string } | { name: string }[] })?.Grant;
          const grantName = (Array.isArray(grantObj) ? grantObj[0]?.name : grantObj?.name) ?? "Grant";
          if (app) {
            await notifyOrgMembers(app.organisationId, "application_failed", {
              grantName,
              applicationId: app.id,
            });
          }
        });

        return { status: "timed_out", attempts: attempt + 1 };
      }
    }

    return { status: "max_attempts_reached" };
  }
);
