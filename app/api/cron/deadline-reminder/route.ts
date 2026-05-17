import { NextResponse } from "next/server";
import { runDeadlineReminderJob } from "@/inngest/deadline-reminder";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/deadline-reminder
 * Vercel Cron (Hobby: daily): runs the same reminder logic as Inngest.
 * Org targeting uses `isNineAmLocal` at invocation time — hourly Inngest remains preferable for timezone coverage.
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
    const result = await runDeadlineReminderJob();
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error("[cron/deadline-reminder]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Reminder job failed" },
      { status: 500 }
    );
  }
}
