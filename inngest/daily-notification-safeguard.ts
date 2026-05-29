import { inngest } from "./client";
import { runWithCronLog } from "@/lib/cron-run-log";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isNineAmLocal } from "@/lib/timezone";
import { isGrantLinkUsable } from "@/lib/grant-freshness";
import { notifyOrgMembers, orgHasNotificationSince, type NotificationType } from "@/lib/notify";
import { organisationAllowsCapability } from "@/lib/plan-check";

const NOTIFY_COOLDOWN_HOURS = 20;
const DEFAULT_DIGEST_SCORE_THRESHOLD = 85;
const MIN_NOTIFICATION_SCORE_FLOOR = 75;
const GRANT_COUNT_BATCH_SIZE = 1000;
const MAX_GRANTS_TO_COUNT = 10000;
const DAILY_ELIGIBILITY_NOTIFICATION_TYPES: NotificationType[] = [
  "daily_grant_update",
  "grant_scan_digest",
  "grant_match_high",
  "eligibility_upgrade_prompt",
  "business_dna_match_health",
];

type ProfileRow = {
  id?: string | null;
  organisationId?: string | null;
  organisation_id?: string | null;
  businessName?: string | null;
  business_name?: string | null;
  completionScore?: number | null;
  completion_score?: number | null;
  updatedAt?: string | null;
  updated_at?: string | null;
};

type OrgRow = {
  id: string;
  preferredTimezone?: string | null;
  preferred_timezone?: string | null;
};

type PreferenceRow = {
  organisation_id?: string | null;
  min_score?: number | null;
  notify_email?: boolean | null;
};

function profileOrgId(profile: ProfileRow): string | null {
  return profile.organisationId ?? profile.organisation_id ?? null;
}

function profileName(profile: ProfileRow | undefined): string {
  return profile?.businessName ?? profile?.business_name ?? "your business";
}

function profileCompletion(profile: ProfileRow | undefined): number {
  const raw = profile?.completionScore ?? profile?.completion_score ?? 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function profileUpdatedAt(profile: ProfileRow | undefined): number {
  const raw = profile?.updatedAt ?? profile?.updated_at;
  if (!raw) return 0;
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : 0;
}

function recentNotificationWindow(): Date {
  const since = new Date();
  since.setHours(since.getHours() - NOTIFY_COOLDOWN_HOURS);
  return since;
}

function notificationMinScore(preferenceScore: number | undefined): number {
  return Math.max(preferenceScore ?? DEFAULT_DIGEST_SCORE_THRESHOLD, MIN_NOTIFICATION_SCORE_FLOOR);
}

async function countUsableGrants(supabase: ReturnType<typeof getSupabaseAdmin>): Promise<number> {
  let count = 0;

  for (let offset = 0; offset < MAX_GRANTS_TO_COUNT; offset += GRANT_COUNT_BATCH_SIZE) {
    const { data, error } = await supabase
      .from("Grant")
      .select("id, url_status, deadline, eligibility, description, objectives")
      .order("createdAt", { ascending: false })
      .range(offset, offset + GRANT_COUNT_BATCH_SIZE - 1);

    if (error) throw error;
    const batch = data ?? [];
    count += batch.filter(isGrantLinkUsable).length;
    if (batch.length < GRANT_COUNT_BATCH_SIZE) break;
  }

  return count;
}

async function countStrongEligibleForOrg(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  orgId: string,
  minScore: number
): Promise<number> {
  const { count } = await supabase
    .from("EligibilityAssessment")
    .select("grant_id", { count: "exact", head: true })
    .eq("organisation_id", orgId)
    .eq("decision", "likely_eligible")
    .eq("scoring_source", "openai")
    .gte("score", minScore);

  return count ?? 0;
}

export async function runDailyNotificationSafeguardJob(options?: {
  orgIdsFilter?: Set<string>;
  respectLocalTime?: boolean;
}): Promise<{
  orgsWithProfile: number;
  orgsAtLocalTime: number;
  skippedRecent: number;
  skippedEmailPreference: number;
  dailyUpdates: number;
  upgradePrompts: number;
  checkedGrantsCount: number;
}> {
  const supabase = getSupabaseAdmin();
  const recentWindow = recentNotificationWindow();
  const respectLocalTime = options?.respectLocalTime !== false;

  const checkedGrantsCount = await countUsableGrants(supabase);

  const { data: profiles = [] } = await supabase
    .from("BusinessProfile")
    .select("id, organisationId, businessName, completionScore, updatedAt");

  const byOrg = new Map<string, ProfileRow[]>();
  for (const profile of (profiles ?? []) as ProfileRow[]) {
    const orgId = profileOrgId(profile);
    if (!orgId) continue;
    if (options?.orgIdsFilter && !options.orgIdsFilter.has(orgId)) continue;
    const existing = byOrg.get(orgId) ?? [];
    existing.push(profile);
    byOrg.set(orgId, existing);
  }

  const orgIds = Array.from(byOrg.keys());
  const diagnostics = {
    orgsWithProfile: orgIds.length,
    orgsAtLocalTime: 0,
    skippedRecent: 0,
    skippedEmailPreference: 0,
    dailyUpdates: 0,
    upgradePrompts: 0,
    checkedGrantsCount,
  };

  if (orgIds.length === 0) {
    console.info("[daily-notification-safeguard] No organisations with profiles", diagnostics);
    return diagnostics;
  }

  const { data: orgRows = [] } = await supabase
    .from("Organisation")
    .select("id, preferredTimezone")
    .in("id", orgIds);
  const orgs = new Map((orgRows ?? []).map((org) => [org.id, org as OrgRow]));

  const { data: prefRows = [] } = await supabase
    .from("EligibilityNotificationPreference")
    .select("organisation_id, min_score, notify_email")
    .in("organisation_id", orgIds);
  const prefs = new Map(
    ((prefRows ?? []) as PreferenceRow[])
      .filter((pref) => Boolean(pref.organisation_id))
      .map((pref) => [pref.organisation_id as string, pref])
  );

  for (const orgId of orgIds) {
    const org = orgs.get(orgId);
    const timezone = org?.preferredTimezone ?? org?.preferred_timezone ?? "UTC";
    if (respectLocalTime && !isNineAmLocal(timezone)) continue;
    diagnostics.orgsAtLocalTime++;

    const pref = prefs.get(orgId);
    if (pref?.notify_email === false) {
      diagnostics.skippedEmailPreference++;
      continue;
    }

    const alreadyDelivered = await orgHasNotificationSince(
      orgId,
      [...DAILY_ELIGIBILITY_NOTIFICATION_TYPES],
      recentWindow
    );
    if (alreadyDelivered) {
      diagnostics.skippedRecent++;
      continue;
    }

    const profilesForOrg = byOrg.get(orgId) ?? [];
    const primaryProfile = [...profilesForOrg].sort((a, b) => {
      const completionDelta = profileCompletion(b) - profileCompletion(a);
      if (completionDelta !== 0) return completionDelta;
      return profileUpdatedAt(b) - profileUpdatedAt(a);
    })[0];
    const minScore = notificationMinScore(pref?.min_score ?? undefined);
    const matchedGrantsCount = await countStrongEligibleForOrg(supabase, orgId, minScore);
    const canReceiveProactiveNotifications = await organisationAllowsCapability(orgId, "proactive_notifications");

    if (!canReceiveProactiveNotifications && matchedGrantsCount > 0) {
      await notifyOrgMembers(
        orgId,
        "eligibility_upgrade_prompt",
        {
          profileName: profileName(primaryProfile),
          matchedGrantsCount,
        },
        { sendEmail: true, sendWhatsApp: false }
      );
      diagnostics.upgradePrompts++;
      continue;
    }

    await notifyOrgMembers(
      orgId,
      "daily_grant_update",
      {
        profileName: profileName(primaryProfile),
        checkedGrantsCount,
        matchedGrantsCount,
      },
      { sendEmail: true, sendWhatsApp: false }
    );
    diagnostics.dailyUpdates++;
  }

  console.info("[daily-notification-safeguard] Complete", diagnostics);
  return diagnostics;
}

export const dailyNotificationSafeguard = inngest.createFunction(
  { id: "daily-notification-safeguard", name: "Daily Notification Safeguard" },
  { cron: "15 * * * *" },
  async () => runWithCronLog(
    { jobName: "Daily Notification Safeguard", route: "inngest/daily-notification-safeguard", trigger: "inngest" },
    () => runDailyNotificationSafeguardJob({ respectLocalTime: true })
  )
);
