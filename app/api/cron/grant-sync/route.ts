import { NextResponse } from "next/server";
import {
  syncGrantsFromFeed,
  syncGrantsFromGrantsGov,
  syncGrantsFromUK,
  syncGrantsFromEU,
} from "@/lib/grants-ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
    const feedResult = await syncGrantsFromFeed();
    const govResult = await syncGrantsFromGrantsGov(500);
    const ukResult = await syncGrantsFromUK();
    const euResult = await syncGrantsFromEU();
    const totalSynced = feedResult.synced + govResult.synced + ukResult.synced + euResult.synced;
    return NextResponse.json({
      ok: true,
      feed: feedResult,
      grantsGov: govResult,
      uk: ukResult,
      eu: euResult,
      totalSynced,
    });
  } catch (e) {
    console.error("[cron/grant-sync]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Sync failed" },
      { status: 500 }
    );
  }
}
