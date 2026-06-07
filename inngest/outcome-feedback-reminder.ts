import { inngest } from "./client";
import { getSupabaseAdmin } from "@/lib/supabase";
import { notifyOrgMembers } from "@/lib/notify";
import { isMondayLocal, isNineAmLocal } from "@/lib/timezone";
import { fetchApplicationsNeedingOutcome } from "@/lib/outcome-feedback";
import { runWithCronLog } from "@/lib/cron-run-log";

/** Runs hourly; emails each org only when it is Monday ~9am in their timezone and pending outcomes exist */
export const outcomeFeedbackReminder = inngest.createFunction(
  { id: "outcome-feedback-reminder", name: "Outcome feedback reminder" },
  { cron: "15 * * * *" },
  async () => runWithCronLog({ jobName: "Outcome Feedback Reminder", route: "inngest/outcome-feedback-reminder", trigger: "inngest" }, async () => {
    const supabase = getSupabaseAdmin();

    const { data: orgsData = [] } = await supabase.from("Organisation").select("id, preferredTimezone");

    const orgsAt9amMonday = (orgsData ?? []).filter((org: { id: string; preferredTimezone?: string | null }) => {
      const tz = org.preferredTimezone ?? "UTC";
      return isMondayLocal(tz) && isNineAmLocal(tz);
    });

    let notifiedOrgs = 0;
    let skippedNoPending = 0;

    for (const org of orgsAt9amMonday) {
      const pending = await fetchApplicationsNeedingOutcome(org.id);
      if (pending.length === 0) {
        skippedNoPending++;
        continue;
      }

      try {
        await notifyOrgMembers(
          org.id,
          "outcome_feedback_reminder",
          {
            pendingOutcomeCount: pending.length,
            outcomeGrantNames: pending.slice(0, 5).map((p) => p.grantName),
          },
          { sendWhatsApp: false }
        );
        notifiedOrgs++;
      } catch (err) {
        console.error("[outcome-feedback-reminder]", org.id, err);
      }
    }

    const summary = {
      orgsConsidered: orgsAt9amMonday.length,
      notifiedOrgs,
      skippedNoPending,
    };
    if (notifiedOrgs === 0 && orgsAt9amMonday.length > 0) {
      console.info("[outcome-feedback-reminder] No emails sent", summary);
    }
    return summary;
  })
);
