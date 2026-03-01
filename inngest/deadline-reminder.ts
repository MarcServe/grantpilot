import { inngest } from "./client";
import { getSupabaseAdmin } from "@/lib/supabase";
import { notifyOrgMembers } from "@/lib/notify";

export const deadlineReminder = inngest.createFunction(
  { id: "deadline-reminder", name: "Grant Deadline Reminder" },
  { cron: "0 9 * * *" },
  async () => {
    const supabase = getSupabaseAdmin();
    const now = new Date();
    const reminderDays = [7, 3, 1];
    let sent = 0;

    for (const days of reminderDays) {
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + days);

      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      const { data: grants = [] } = await supabase
        .from("Grant")
        .select("*")
        .gte("deadline", startOfDay.toISOString())
        .lte("deadline", endOfDay.toISOString());

      if ((grants ?? []).length === 0) continue;

      const { data: profiles = [] } = await supabase
        .from("BusinessProfile")
        .select("*")
        .gte("completionScore", 50);

      const list = profiles ?? [];
      const byOrg = new Map<string, (typeof list)[number]>();
      for (const p of list) {
        if (!byOrg.has(p.organisationId)) byOrg.set(p.organisationId, p);
      }
      const orgs = Array.from(byOrg.entries()).map(([id, profile]) => ({
        id,
        profiles: [profile],
      }));

      for (const grant of grants ?? []) {
        for (const org of orgs) {
          if (!org.profiles[0]) continue;

          const { data: alreadyApplied } = await supabase
            .from("Application")
            .select("id")
            .eq("organisationId", org.id)
            .eq("grantId", grant.id)
            .maybeSingle();

          if (alreadyApplied) continue;

          try {
            await notifyOrgMembers(org.id, "deadline_reminder", {
              grantName: grant.name,
              deadline: grant.deadline ? new Date(grant.deadline).toLocaleDateString("en-GB") : undefined,
            });
            sent++;
          } catch (err) {
            console.error(`[deadline-reminder] Error:`, err);
          }
        }
      }
    }

    return { sent };
  }
);
