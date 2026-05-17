import { NextResponse } from "next/server";
import { runDeadlineReminderJob } from "@/inngest/deadline-reminder";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/deadline-reminder
 * Vercel Cron fallback for 9:00 AM local deadline reminders.
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
  } catch (error) {
    console.error("[cron/deadline-reminder]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Deadline reminder failed" },
      { status: 500 }
    );
  }
}
