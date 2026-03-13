import { inngest } from "./client";
import { getSupabaseAdmin } from "@/lib/supabase";
import { notifyOrgMembers } from "@/lib/notify";
import { createStartApplicationToken } from "@/lib/start-application-token";
import { isNineAmLocal } from "@/lib/timezone";

export const deadlineReminder = inngest.createFunction(
  { id: "deadline-reminder", name: "Grant Deadline Reminder" },
  { cron: "0 * * * *" }, // Every hour; send only when it's 9am in the org's timezone
  async () => {
    const supabase = getSupabaseAdmin();
    const now = new Date();
    const reminderDays = [7, 3, 1] as const;
    let sent = 0;
    const diagnostics: {
      profilesWithScore50: number;
      orgsWithProfile: number;
      orgsAt9amLocal: number;
      grantsByDay: Record<number, number>;
      sent: number;
    } = {
      profilesWithScore50: 0,
      orgsWithProfile: 0,
      orgsAt9amLocal: 0,
      grantsByDay: { 7: 0, 3: 0, 1: 0 },
      sent: 0,
    };

    const { data: profiles = [] } = await supabase
      .from("BusinessProfile")
      .select("*")
      .gte("completionScore", 50);

    const list = profiles ?? [];
    diagnostics.profilesWithScore50 = list.length;

    const byOrgId = new Map<string, (typeof list)[number]>();
    for (const p of list) {
      const orgId = (p as { organisationId?: string; organisation_id?: string }).organisationId ?? (p as { organisation_id?: string }).organisation_id;
      if (orgId && !byOrgId.has(orgId)) byOrgId.set(orgId, p);
    }

    const orgIds = Array.from(byOrgId.keys());
    diagnostics.orgsWithProfile = orgIds.length;

    if (orgIds.length === 0) {
      console.info("[deadline-reminder] No orgs with profile completionScore >= 50", diagnostics);
      return { ...diagnostics };
    }

    const { data: orgsData = [] } = await supabase
      .from("Organisation")
      .select("id, preferredTimezone")
      .in("id", orgIds);

    const orgsToNotify = (orgsData ?? []).filter((org: { id: string; preferredTimezone?: string | null }) =>
      isNineAmLocal(org.preferredTimezone ?? "UTC")
    );
    diagnostics.orgsAt9amLocal = orgsToNotify.length;
    const notifyOrgIds = new Set(orgsToNotify.map((o: { id: string }) => o.id));

    if (notifyOrgIds.size === 0) {
      console.info("[deadline-reminder] No orgs at 9am local this hour", diagnostics);
      return { ...diagnostics };
    }

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

      const grantCount = (grants ?? []).length;
      diagnostics.grantsByDay[days] = grantCount;
      if (grantCount === 0) continue;

      const orgs = Array.from(byOrgId.entries())
        .filter(([id]) => notifyOrgIds.has(id))
        .map(([id, profile]) => ({ id, profiles: [profile] }));

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

          const profile = org.profiles[0];
          const profileId = (profile as { id?: string }).id;
          if (!profileId) continue;

          const { data: prefs } = await supabase
            .from("EligibilityNotificationPreference")
            .select("min_score, max_score")
            .eq("organisation_id", org.id)
            .maybeSingle();
          const minScore = (prefs as { min_score?: number } | null)?.min_score ?? 70;
          const maxScore = (prefs as { max_score?: number } | null)?.max_score ?? 100;

          const { data: assessment } = await supabase
            .from("EligibilityAssessment")
            .select("score")
            .eq("organisation_id", org.id)
            .eq("profile_id", profileId)
            .eq("grant_id", grant.id)
            .maybeSingle();
          const score = (assessment as { score?: number } | null)?.score;
          if (score == null || score < minScore || score > maxScore) continue;

          try {
            const startApplicationToken = profile
              ? createStartApplicationToken({
                  grantId: grant.id,
                  profileId: profile.id,
                  organisationId: org.id,
                })
              : undefined;
            await notifyOrgMembers(org.id, "deadline_reminder", {
              grantName: grant.name,
              grantId: grant.id,
              deadline: grant.deadline ? new Date(grant.deadline).toLocaleDateString("en-GB") : undefined,
              startApplicationToken,
            });
            sent++;
          } catch (err) {
            console.error(`[deadline-reminder] Error:`, err);
          }
        }
      }
    }

    diagnostics.sent = sent;
    if (sent === 0) {
      console.info("[deadline-reminder] No reminders sent; run output has diagnostics", diagnostics);
    }
    return { ...diagnostics };
  }
);
