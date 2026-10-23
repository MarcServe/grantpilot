import type { getSupabaseAdmin } from "@/lib/supabase";

type Admin = ReturnType<typeof getSupabaseAdmin>;

// Criteria tables also link organisations and profiles. Pin the direct FK so
// PostgREST does not infer a many-to-many path after those migrations.
export const USER_WITH_MEMBERSHIPS_SELECT =
  "*, OrganisationMember(*, Organisation(*, BusinessProfile!BusinessProfile_organisationId_fkey(*)))";

/** Never replace an existing application's User.id with an auth-derived ID. */
export async function ensureUserRecord(admin: Admin, supabaseId: string, email: string) {
  const inserted = await admin.from("User").upsert(
    { id: `user-${supabaseId}`, supabaseId, email },
    { onConflict: "supabaseId", ignoreDuplicates: true },
  );
  if (inserted.error) throw inserted.error;
  const existing = await admin.from("User").select("id").eq("supabaseId", supabaseId).single();
  if (existing.error) throw existing.error;
  return existing.data as { id: string };
}
