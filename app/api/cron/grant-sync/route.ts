import { NextResponse } from "next/server";
import { enqueueGrantSync } from "@/lib/grant-sync-jobs";
import { runWithCronLog } from "@/lib/cron-run-log";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/cron/grant-sync
 * Vercel Cron: enqueue bounded grant sync work and return quickly.
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
      { jobName: "Grant Sync Enqueue", route: "/api/cron/grant-sync", trigger: "vercel" },
      async () => enqueueGrantSync({ source: "vercel.cron.grant-sync" })
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("[cron/grant-sync]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Grant sync enqueue failed" },
      { status: 500 }
    );
  }
}
