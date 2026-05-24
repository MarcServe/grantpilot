import { NextResponse } from "next/server";
import { runDiscoveryEnqueue } from "@/lib/grant-discovery-enqueue";
import { processGrantDiscoveryQueue } from "@/lib/grant-discovery-processor";
import { runWithCronLog } from "@/lib/cron-run-log";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function processLimit(): number {
  const raw = Number(process.env.GRANT_DISCOVERY_QUEUE_LIMIT ?? 20);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 20;
}

/**
 * GET /api/cron/grant-discovery-queue
 * Vercel Cron fallback for sitemap/RSS/search URL discovery and AI extraction.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { enqueue, process } = await runWithCronLog(
      { jobName: "Grant Discovery Queue", route: "/api/cron/grant-discovery-queue", trigger: "vercel" },
      async () => {
        const enqueue = await runDiscoveryEnqueue();
        const process = await processGrantDiscoveryQueue(processLimit());
        return { enqueue, process };
      }
    );
    return NextResponse.json({ ok: true, enqueue, process });
  } catch (error) {
    console.error("[cron/grant-discovery-queue]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Grant discovery queue failed" },
      { status: 500 }
    );
  }
}
