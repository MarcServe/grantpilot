import { NextResponse } from "next/server";
import { discoverGrantSourcesWithApify } from "@/lib/apify-grant-source-discovery";
import { runWithCronLog } from "@/lib/cron-run-log";
import { importGrantSourcesFromPayload } from "@/lib/grant-source-import";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function cronLimit(): number {
  const raw = Number(process.env.APIFY_GRANT_SOURCE_LIMIT ?? 20);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 20;
}

function auth(req: Request): boolean {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  return !secret || authHeader === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!auth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apifyToken = process.env.APIFY_TOKEN?.trim();
  if (!apifyToken) {
    return NextResponse.json({ error: "APIFY_TOKEN is not configured." }, { status: 500 });
  }

  try {
    const result = await runWithCronLog(
      {
        jobName: "Apify Grant Source Discovery",
        route: "/api/cron/apify-grant-source-discovery",
        trigger: "vercel",
      },
      async () => {
        const discovery = await discoverGrantSourcesWithApify({
          apifyToken,
          maxSources: cronLimit(),
          actorId: process.env.APIFY_GOOGLE_SEARCH_ACTOR_ID,
        });
        const importResult = await importGrantSourcesFromPayload({
          runSource: "apify",
          createdBy: "vercel_cron_apify_grant_source_discovery",
          autoSeedDefaultSources: true,
          sources: discovery.sources,
        });
        return {
          runId: discovery.runId,
          datasetId: discovery.datasetId,
          searchResults: discovery.itemCount,
          candidateSources: discovery.sources.length,
          importResult,
        };
      }
    );
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("[cron/apify-grant-source-discovery]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Apify grant source discovery failed" },
      { status: 500 }
    );
  }
}
