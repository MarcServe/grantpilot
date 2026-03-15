import { inngest } from "./client";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isLikelyProgrammeInfoUrl } from "@/lib/grant-url-validation";

const MAX_GRANTS_PER_RUN = 50;
const RECENT_FOUND_DAYS = 14;

/**
 * Nightly Scout enqueue: find grants with programme/info-style URLs that need
 * the real application form URL discovered. Inserts/updates grant_links to
 * status='pending' so the Fly.io Scout worker can process them.
 * Apply with GrantsCopilot then uses Grant.applicationUrl (updated by the worker).
 */
export const grantFormUrlScout = inngest.createFunction(
  { id: "grant-form-url-scout", name: "Nightly Grant Form URL Scout (enqueue)" },
  { cron: "0 2 * * *" }, // 2:00 UTC — after sync, before users wake
  async () => {
    const supabase = getSupabaseAdmin();

    const { data: grantsData, error: grantsError } = await supabase
      .from("Grant")
      .select("id, name, funder, amount, deadline, applicationUrl");

    if (grantsError) {
      console.error("[grant-form-url-scout] Grant fetch error:", grantsError);
      return { enqueued: 0, error: grantsError.message };
    }

    const grants = (grantsData ?? []).filter(
      (g: { applicationUrl?: string }) =>
        g.applicationUrl && isLikelyProgrammeInfoUrl(String(g.applicationUrl).trim())
    );

    if (grants.length === 0) {
      return { enqueued: 0, message: "No programme-style URLs to scout" };
    }

    // Exclude grants that have a recent successful scout (found in last RECENT_FOUND_DAYS)
    const grantIds = grants.map((g: { id: string }) => g.id);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RECENT_FOUND_DAYS);

    const { data: recentFound = [] } = await supabase
      .from("grant_links")
      .select("grant_id")
      .in("grant_id", grantIds)
      .eq("status", "found")
      .gte("discovered_at", cutoff.toISOString());

    const recentlyFoundIds = new Set((recentFound as { grant_id: string }[]).map((r) => r.grant_id));
    const toEnqueue = grants.filter((g: { id: string }) => !recentlyFoundIds.has(g.id)).slice(0, MAX_GRANTS_PER_RUN);

    let enqueued = 0;
    for (const g of toEnqueue) {
      const grant = g as {
        id: string;
        name: string;
        funder: string;
        amount?: number;
        deadline?: string;
        applicationUrl: string;
      };
      const { error: upsertError } = await supabase.from("grant_links").upsert(
        {
          grant_id: grant.id,
          homepage_url: grant.applicationUrl.trim(),
          grant_name: grant.name ?? null,
          funder: grant.funder ?? null,
          amount: grant.amount != null ? String(grant.amount) : null,
          deadline: grant.deadline ?? null,
          status: "pending",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "grant_id", ignoreDuplicates: false }
      );

      if (upsertError) {
        // If row exists with status running/pending, conflict may prevent update; skip
        if (upsertError.code !== "23505") {
          console.warn("[grant-form-url-scout] upsert error for grant", grant.id, upsertError);
        }
        continue;
      }
      enqueued += 1;
    }

    return { enqueued, totalProgrammeStyle: grants.length, skippedRecent: recentlyFoundIds.size };
  }
);
