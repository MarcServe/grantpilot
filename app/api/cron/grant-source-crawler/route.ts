import { NextResponse } from "next/server";
import { runGrantSourceCrawlerJob } from "@/inngest/grant-source-crawler";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/grant-source-crawler
 * Vercel Cron (Hobby: daily): crawl due rows in grant_sources when Inngest is unavailable.
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
    const result = await runGrantSourceCrawlerJob();
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error("[cron/grant-source-crawler]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Crawler failed" },
      { status: 500 }
    );
  }
}
