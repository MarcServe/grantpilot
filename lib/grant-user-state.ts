import type { SupabaseClient } from "@supabase/supabase-js";

export type GrantUserState = "saved" | "viewed" | "deferred" | "applied" | "dismissed";

const SUPPRESSING_STATES = new Set<GrantUserState>(["deferred", "applied", "dismissed"]);
const PRIORITY: Record<GrantUserState, number> = {
  saved: 1,
  viewed: 2,
  deferred: 3,
  applied: 4,
  dismissed: 5,
};

export function shouldSuppressGrantNotifications(status: GrantUserState): boolean {
  return SUPPRESSING_STATES.has(status);
}

export function savedGrantSuppressesNotifications(
  row: { status?: GrantUserState | null; suppress_notifications?: boolean | null },
  options?: { includeViewed?: boolean }
): boolean {
  if (row.status && shouldSuppressGrantNotifications(row.status)) return true;
  if (row.status === "viewed" && options?.includeViewed !== true) return false;
  return row.suppress_notifications === true;
}

export async function getSuppressedGrantIds(
  supabase: SupabaseClient,
  organisationId: string,
  profileId: string,
  options?: { includeViewed?: boolean }
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("SavedGrant")
    .select("grant_id, status, suppress_notifications")
    .eq("organisation_id", organisationId)
    .eq("profile_id", profileId);
  if (error) {
    console.warn("[grant-user-state] suppression lookup failed", error.message);
    return new Set();
  }
  return new Set(
    (data ?? [])
      .filter((row: { status?: GrantUserState | null; suppress_notifications?: boolean | null }) =>
        savedGrantSuppressesNotifications(row, options)
      )
      .map((row: { grant_id: string }) => row.grant_id)
  );
}

export async function markGrantUserState(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    profileId: string;
    grantId: string;
    status: GrantUserState;
    notes?: string | null;
  }
): Promise<void> {
  const now = new Date().toISOString();
  const { organisationId, profileId, grantId, status } = params;

  const { data: existing } = await supabase
    .from("SavedGrant")
    .select("status")
    .eq("organisation_id", organisationId)
    .eq("profile_id", profileId)
    .eq("grant_id", grantId)
    .maybeSingle();

  const existingStatus = (existing as { status?: GrantUserState } | null)?.status;
  const nextStatus =
    existingStatus && PRIORITY[existingStatus] > PRIORITY[status] ? existingStatus : status;

  const payload: Record<string, unknown> = {
    organisation_id: organisationId,
    profile_id: profileId,
    grant_id: grantId,
    status: nextStatus,
    suppress_notifications: shouldSuppressGrantNotifications(nextStatus),
    updated_at: now,
  };

  if (status === "viewed") payload.viewed_at = now;
  if (status === "deferred") payload.deferred_at = now;
  if (status === "applied") payload.applied_at = now;
  if (status === "dismissed") payload.dismissed_at = now;
  if (params.notes !== undefined) payload.notes = params.notes;

  const { error } = await supabase
    .from("SavedGrant")
    .upsert(payload, { onConflict: "organisation_id,profile_id,grant_id" });

  if (error) throw new Error(error.message);
}
