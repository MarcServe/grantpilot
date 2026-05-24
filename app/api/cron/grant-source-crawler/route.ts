import { NextResponse } from "next/server";
import { runDueGrantSources } from "@/lib/grant-sources";
import { runWithCronLog } from "@/lib/cron-run-log";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function cronLimit(): number {
  const raw = Number(process.env.GRANT_SOURCE_CRON_LIMIT ?? 20);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 20;
}

/**
 * GET /api/cron/grant-source-crawler
 * Vercel Cron fallback for the grant_sources registry used by RSS/crawl links.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runWithCronLog(
      { jobName: "Grant Source Registry Crawler", route: "/api/cron/grant-source-crawler", trigger: "vercel" },
      () => runDueGrantSources({ limit: cronLimit() })
    );
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("[cron/grant-source-crawler]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Grant source crawl failed" },
      { status: 500 }
    );
  }
}
