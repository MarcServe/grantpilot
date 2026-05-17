import { NextResponse } from "next/server";
import { runDiscoveryEnqueue } from "@/lib/grant-discovery-enqueue";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/grant-discovery-queue
 * Vercel Cron (Hobby: daily): enqueue sitemap/RSS URLs into grant_discovery_queue when Inngest is unavailable.
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
    const result = await runDiscoveryEnqueue();
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error("[cron/grant-discovery-queue]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Enqueue failed" },
      { status: 500 }
    );
  }
}
