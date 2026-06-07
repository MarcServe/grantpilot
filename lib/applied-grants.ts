import type { SupabaseClient } from "@supabase/supabase-js";

function grantIdFromApplication(row: Record<string, unknown>): string | null {
  const grantId = row.grantId ?? row.grant_id;
  return typeof grantId === "string" && grantId.trim().length > 0 ? grantId : null;
}

/**
 * Returns grants that already have an Application for this org/profile.
 * Any application row counts as "already applied/started" so daily matching
 * does not keep nudging users about grants they have acted on.
 */
export async function getAppliedGrantIds(
  supabase: SupabaseClient,
  organisationId: string,
  profileId?: string | null
): Promise<Set<string>> {
  const rows: Record<string, unknown>[] = [];

  const camel = supabase
    .from("Application")
    .select("grantId")
    .eq("organisationId", organisationId);
  const camelResult = profileId
    ? await camel.eq("profileId", profileId)
    : await camel;
  if (camelResult.data) rows.push(...(camelResult.data as Record<string, unknown>[]));

  const snake = supabase
    .from("Application")
    .select("grant_id")
    .eq("organisation_id", organisationId);
  const snakeResult = profileId
    ? await snake.eq("profile_id", profileId)
    : await snake;
  if (snakeResult.data) rows.push(...(snakeResult.data as Record<string, unknown>[]));

  return new Set(rows.map(grantIdFromApplication).filter((id): id is string => id != null));
}
