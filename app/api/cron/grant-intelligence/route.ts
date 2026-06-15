import { NextResponse } from "next/server";

import { runWithCronLog } from "@/lib/cron-run-log";
import {
  GRANT_INTELLIGENCE_BATCH_SIZE,
  enqueueGrantsForIntelligence,
  processGrantIntelligenceQueue,
} from "@/lib/grant-intelligence-queue";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) return unauthorized();

  try {
    const result = await runWithCronLog(
      { jobName: "Grant Intelligence Queue", route: "/api/cron/grant-intelligence", trigger: "vercel" },
      async () => {
        const supabase = getSupabaseAdmin();
        const enqueueLimit = Math.max(1, Math.min(1000, Number(process.env.GRANT_INTELLIGENCE_ENQUEUE_LIMIT ?? 500)));
        const processLimit = Math.max(1, Math.min(100, Number(process.env.GRANT_INTELLIGENCE_BATCH_SIZE ?? GRANT_INTELLIGENCE_BATCH_SIZE)));
        const queued = await enqueueGrantsForIntelligence({
          supabase,
          limit: enqueueLimit,
          source: "cron.grant_intelligence",
        });
        const processed = await processGrantIntelligenceQueue({ supabase, limit: processLimit });
        return {
          queued,
          processed,
        };
      }
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron/grant-intelligence]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Grant intelligence queue failed" },
      { status: 500 }
    );
  }
}
