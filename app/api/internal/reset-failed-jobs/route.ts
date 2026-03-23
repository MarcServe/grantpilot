import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;

/**
 * POST /api/internal/reset-failed-jobs
 * Resets scout jobs and application sessions that failed due to infrastructure
 * issues (e.g. missing Playwright binary) so the Fly.io worker can retry them.
 *
 * Body (optional): { "resetScout": true, "resetApplications": true, "errorPattern": "..." }
 */
export async function POST(req: Request): Promise<NextResponse> {
  const secret = req.headers.get("x-internal-secret");
  if (!INTERNAL_SECRET || secret !== INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as {
    resetScout?: boolean;
    resetApplications?: boolean;
    errorPattern?: string;
  };
  const resetScout = body.resetScout !== false;
  const resetApplications = body.resetApplications !== false;
  const errorPattern = body.errorPattern ?? "%Executable doesn%";

  const sb = getSupabaseAdmin();
  const results: Record<string, unknown> = {};

  if (resetScout) {
    const { data: scoutRows, error: scoutErr } = await sb
      .from("grant_links")
      .update({ status: "pending", error_message: null, updated_at: new Date().toISOString() })
      .eq("status", "failed")
      .like("error_message", errorPattern)
      .select("id");

    results.scoutJobsReset = scoutErr ? { error: scoutErr.message } : (scoutRows?.length ?? 0);
  }

  if (resetApplications) {
    const { data: failedSessions, error: sessErr } = await sb
      .from("cu_sessions")
      .select("id, public_id")
      .eq("status", "failed")
      .like("error_log", errorPattern);

    if (sessErr) {
      results.sessionsReset = { error: sessErr.message };
    } else if (failedSessions && failedSessions.length > 0) {
      const sessionIds = failedSessions.map((s: { id: number }) => s.id);

      const { error: itemErr } = await sb
        .from("cu_session_items")
        .update({ status: "pending", processed_at: null })
        .in("session_id", sessionIds)
        .neq("status", "done");

      const { error: sessUpdateErr } = await sb
        .from("cu_sessions")
        .update({ status: "running", error_log: null })
        .in("id", sessionIds);

      const applicationIds = failedSessions
        .map((s: { public_id: string }) => s.public_id.replace(/^grantapp_/, ""))
        .filter((id: string) => id.length > 0);

      let appsReset = 0;
      if (applicationIds.length > 0) {
        const { data: appRows } = await sb
          .from("Application")
          .update({ status: "FILLING", updatedAt: new Date().toISOString() })
          .in("id", applicationIds)
          .eq("status", "FAILED")
          .select("id");
        appsReset = appRows?.length ?? 0;
      }

      results.sessionsReset = sessUpdateErr
        ? { error: sessUpdateErr.message }
        : sessionIds.length;
      results.sessionItemsReset = itemErr ? { error: itemErr.message } : "ok";
      results.applicationsReset = appsReset;
    } else {
      results.sessionsReset = 0;
    }
  }

  return NextResponse.json({ ok: true, ...results });
}
