"use server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveOrg } from "@/lib/auth";
import { VALID_TIMEZONES } from "@/lib/timezone";

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
