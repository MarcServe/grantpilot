import { NextResponse } from "next/server";
import { discoverGrantSourcesWithApify } from "@/lib/apify-grant-source-discovery";
import { runWithCronLog } from "@/lib/cron-run-log";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DEFAULT_APP_URL = "https://www.grantscopilot.com";

function cronLimit(): number {
  const raw = Number(process.env.APIFY_GRANT_SOURCE_LIMIT ?? 20);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 20;
}

function auth(req: Request): boolean {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  return !secret || authHeader === `Bearer ${secret}`;
}

function appUrlFromRequest(req: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  try {
    const url = new URL(req.url);
    return `${url.protocol}//${url.host}`;
  } catch {
    return DEFAULT_APP_URL;
  }
}

async function importSources(appUrl: string, internalSecret: string, sources: unknown[]) {
  const response = await fetch(`${appUrl}/api/internal/grant-sources/import`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": internalSecret,
    },
    body: JSON.stringify({
      runSource: "apify",
      createdBy: "vercel_cron_apify_grant_source_discovery",
      autoSeedDefaultSources: true,
      sources,
    }),
  });
  const body = await response.json().catch(async () => ({ raw: await response.text().catch(() => "") }));
  if (!response.ok) {
    throw new Error(`Grant source import failed: ${response.status} ${JSON.stringify(body).slice(0, 500)}`);
  }
  return body;
}

export async function GET(req: Request) {
  if (!auth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apifyToken = process.env.APIFY_TOKEN?.trim();
  const internalSecret = process.env.INTERNAL_API_SECRET?.trim();
  if (!apifyToken) {
    return NextResponse.json({ error: "APIFY_TOKEN is not configured." }, { status: 500 });
  }
  if (!internalSecret) {
    return NextResponse.json({ error: "INTERNAL_API_SECRET is not configured." }, { status: 500 });
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
        const importResult = await importSources(appUrlFromRequest(req), internalSecret, discovery.sources);
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
