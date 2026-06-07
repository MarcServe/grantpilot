import { inngest } from "./client";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isLikelyProgrammeInfoUrl } from "@/lib/grant-url-validation";
import { runWithCronLog } from "@/lib/cron-run-log";

const MAX_GRANTS_PER_RUN = 50;
const MAX_CANDIDATE_GRANTS = 500;
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
  async () => runWithCronLog({ jobName: "Nightly Grant Form URL Scout", route: "inngest/grant-form-url-scout", trigger: "inngest" }, async () => {
    const supabase = getSupabaseAdmin();

    const { data: grantsData, error: grantsError } = await supabase
      .from("Grant")
      .select("id, name, funder, amount, deadline, applicationUrl, createdAt")
      .not("applicationUrl", "is", null)
      .order("createdAt", { ascending: false, nullsFirst: false })
      .limit(MAX_CANDIDATE_GRANTS);

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

    const { data: activeRows = [], error: activeError } = await supabase
      .from("grant_links")
      .select("grant_id")
      .in("grant_id", grantIds)
      .in("status", ["pending", "running"]);

    if (activeError) {
      console.error("[grant-form-url-scout] Active scout query error:", activeError);
      return { enqueued: 0, totalProgrammeStyle: grants.length, error: activeError.message };
    }

    const { data: recentFound = [], error: recentFoundError } = await supabase
      .from("grant_links")
      .select("grant_id")
      .in("grant_id", grantIds)
      .eq("status", "found")
      .gte("discovered_at", cutoff.toISOString());

    if (recentFoundError) {
      console.error("[grant-form-url-scout] Recent scout query error:", recentFoundError);
      return { enqueued: 0, totalProgrammeStyle: grants.length, error: recentFoundError.message };
    }

    const activeIds = new Set((activeRows as { grant_id: string }[]).map((r) => r.grant_id));
    const recentlyFoundIds = new Set((recentFound as { grant_id: string }[]).map((r) => r.grant_id));
    const toEnqueue = grants
      .filter((g: { id: string }) => !activeIds.has(g.id) && !recentlyFoundIds.has(g.id))
      .slice(0, MAX_GRANTS_PER_RUN);

    if (toEnqueue.length === 0) {
      return {
        enqueued: 0,
        totalProgrammeStyle: grants.length,
        skippedActive: activeIds.size,
        skippedRecent: recentlyFoundIds.size,
      };
    }

    const rows = toEnqueue.map((g) => {
      const grant = g as {
        id: string;
        name: string;
        funder: string;
        amount?: number;
        deadline?: string;
        applicationUrl: string;
      };
      return {
        grant_id: grant.id,
        homepage_url: grant.applicationUrl.trim(),
        grant_name: grant.name ?? null,
        funder: grant.funder ?? null,
        amount: grant.amount != null ? String(grant.amount) : null,
        deadline: grant.deadline ?? null,
        status: "pending",
        updated_at: new Date().toISOString(),
      };
    });

    const { error: upsertError } = await supabase.from("grant_links").upsert(rows, {
      onConflict: "grant_id",
      ignoreDuplicates: false,
    });

    if (upsertError) {
      console.warn("[grant-form-url-scout] bulk upsert error:", upsertError);
      return {
        enqueued: 0,
        totalProgrammeStyle: grants.length,
        skippedActive: activeIds.size,
        skippedRecent: recentlyFoundIds.size,
        error: upsertError.message,
      };
    }

    return {
      enqueued: rows.length,
      totalProgrammeStyle: grants.length,
      skippedActive: activeIds.size,
      skippedRecent: recentlyFoundIds.size,
    };
  })
);
