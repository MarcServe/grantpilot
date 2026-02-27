import { inngest } from "./client";
import { prisma } from "@/lib/prisma";
import { notifyOrgMembers } from "@/lib/notify";

export const deadlineReminder = inngest.createFunction(
  { id: "deadline-reminder", name: "Grant Deadline Reminder" },
  { cron: "0 9 * * *" },
  async () => {
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

      const grants = await prisma.grant.findMany({
        where: {
          deadline: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
      });

      if (grants.length === 0) continue;

      const orgs = await prisma.organisation.findMany({
        include: {
          profiles: { where: { completionScore: { gte: 50 } } },
        },
      });

      for (const grant of grants) {
        for (const org of orgs) {
          if (!org.profiles[0]) continue;

          const alreadyApplied = await prisma.application.findFirst({
            where: { organisationId: org.id, grantId: grant.id },
          });

          if (alreadyApplied) continue;

          try {
            await notifyOrgMembers(org.id, "deadline_reminder", {
              grantName: grant.name,
              deadline: grant.deadline?.toLocaleDateString("en-GB"),
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
