import { resolveGrantSourceLinks } from "@/lib/grant-source-links";
/**
 * Enqueue a grant for Scout so the worker can resolve the direct application form URL.
 * Used when applicationUrl looks like a programme/list page or when Apply hit 404/list.
 */

import { getSupabaseAdmin } from "@/lib/supabase";
import { isLikelyProgrammeInfoUrl } from "@/lib/grant-url-validation";

/**
 * Enqueue a grant for Scout (upsert grant_links with status=pending).
 * Returns true if enqueued, false if skipped (no URL or DB error).
 */
export async function enqueueGrantForScout(grantId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data: grant, error: fetchError } = await supabase
    .from("Grant")
    .select("id, name, funder, amount, deadline, applicationUrl, detailUrl, directApplicationUrl, applicationUrlQuality")
    .eq("id", grantId)
    .maybeSingle();

  if (fetchError || !grant) return false;

  const links = resolveGrantSourceLinks(grant);
  const applicationUrl = links.sourceUrl ?? links.discoveryUrl;
  if (!applicationUrl) return false;

  const { error: upsertError } = await supabase.from("grant_links").upsert(
    {
      grant_id: grantId,
      homepage_url: applicationUrl,
      grant_name: (grant as { name?: string }).name ?? null,
      funder: (grant as { funder?: string }).funder ?? null,
      amount: (grant as { amount?: number }).amount != null ? String((grant as { amount?: number }).amount) : null,
      deadline: (grant as { deadline?: string }).deadline ?? null,
      status: "pending",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "grant_id", ignoreDuplicates: false }
  );

  return !upsertError;
}

/**
 * Enqueue a grant for Scout only if its applicationUrl looks like a programme/info page.
 * Returns true if enqueued.
 */
export async function enqueueGrantForScoutIfProgrammeUrl(grantId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data: grant, error: fetchError } = await supabase
    .from("Grant")
    .select("id, name, funder, amount, deadline, applicationUrl, detailUrl, directApplicationUrl, applicationUrlQuality")
    .eq("id", grantId)
    .maybeSingle();

  if (fetchError || !grant) return false;

  const links = resolveGrantSourceLinks(grant);
  const applicationUrl = links.sourceUrl ?? links.discoveryUrl;
  if (!applicationUrl || !isLikelyProgrammeInfoUrl(applicationUrl)) return false;

  const { error: upsertError } = await supabase.from("grant_links").upsert(
    {
      grant_id: grantId,
      homepage_url: applicationUrl,
      grant_name: (grant as { name?: string }).name ?? null,
      funder: (grant as { funder?: string }).funder ?? null,
      amount: (grant as { amount?: number }).amount != null ? String((grant as { amount?: number }).amount) : null,
      deadline: (grant as { deadline?: string }).deadline ?? null,
      status: "pending",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "grant_id", ignoreDuplicates: false }
  );

  return !upsertError;
}
