"use server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveOrg } from "@/lib/auth";

const VALID_TIMEZONES = [
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Australia/Sydney",
] as const;

export async function updateOrganisationTimezone(
  timezone: string | null
): Promise<{ error?: string }> {
  const { orgId } = await getActiveOrg();
  const tz = timezone?.trim() || null;
  if (tz != null && !VALID_TIMEZONES.includes(tz as (typeof VALID_TIMEZONES)[number])) {
    return { error: "Invalid timezone" };
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("Organisation")
    .update({ preferredTimezone: tz })
    .eq("id", orgId);
  if (error) return { error: error.message };
  return {};
}

export { VALID_TIMEZONES };
