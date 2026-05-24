import { NextResponse } from "next/server";
import {
  syncGrantsFromFeed,
  syncGrantsFromGrantsGov,
  syncGrantsFromUK,
  syncGrantsFromEU,
} from "@/lib/grants-ingest";
import { runWithCronLog } from "@/lib/cron-run-log";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type SyncResult = { synced: number; created: number; updated: number; error?: string };

async function runSyncStep(
  label: string,
  fn: () => Promise<{ synced: number; created: number; updated: number }>
): Promise<SyncResult> {
  try {
    return await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[cron/grant-sync] ${label} failed`, error);
    return { synced: 0, created: 0, updated: 0, error: message };
  }
}

/**
 * GET /api/cron/grant-sync
 * Vercel Cron: sync grants from feed, Grants.gov, UK, EU so the database refreshes daily
 * even when Inngest is not configured. Call at 6:00 UTC (or after grant-discovery).
 *
 * Security: requires Authorization: Bearer <CRON_SECRET>.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runWithCronLog(
      { jobName: "Grant Sync", route: "/api/cron/grant-sync", trigger: "vercel" },
      async () => {
        const feedResult = await runSyncStep("feed", () => syncGrantsFromFeed());
        const govResult = await runSyncStep("grantsGov", () => syncGrantsFromGrantsGov(500));
        const ukResult = await runSyncStep("uk", () => syncGrantsFromUK());
        const euResult = await runSyncStep("eu", () => syncGrantsFromEU());
        const totalSynced = feedResult.synced + govResult.synced + ukResult.synced + euResult.synced;
        const partialErrors: Record<string, string> = {};
        if (feedResult.error) partialErrors.feed = feedResult.error;
        if (govResult.error) partialErrors.grantsGov = govResult.error;
        if (ukResult.error) partialErrors.uk = ukResult.error;
        if (euResult.error) partialErrors.eu = euResult.error;
        return {
          feed: feedResult,
          grantsGov: govResult,
          uk: ukResult,
          eu: euResult,
          totalSynced,
          partialErrors,
        };
      }
    );

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (e) {
    console.error("[cron/grant-sync]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Sync failed" },
      { status: 500 }
    );
  }
}
