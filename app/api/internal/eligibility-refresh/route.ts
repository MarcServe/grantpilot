import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { enqueueEligibilityRefreshes, runEligibilityRefreshJob } from "@/inngest/eligibility-refresh";

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;

/**
 * POST /api/internal/eligibility-refresh
 * Manually runs or enqueues eligibility scoring + notifications outside the daily cron.
 * Pass orgId in the query/body to run one scoped organisation immediately.
 * Pass ?reset=true to clear notification and score caches first.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const secret = req.headers.get("x-internal-secret");
  if (!INTERNAL_SECRET || secret !== INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const bodyText = await req.text().catch(() => "");
    let body: { orgId?: unknown; organisationId?: unknown } = {};
    if (bodyText) {
      try {
        body = JSON.parse(bodyText) as { orgId?: unknown; organisationId?: unknown };
      } catch {
        body = {};
      }
    }
    const orgId =
      url.searchParams.get("orgId")?.trim() ||
      (typeof body.orgId === "string" ? body.orgId.trim() : "") ||
      (typeof body.organisationId === "string" ? body.organisationId.trim() : "");

    if (url.searchParams.get("reset") === "true") {
      const supabase = getSupabaseAdmin();
      const staleDate = new Date(0).toISOString();
      let resetQuery = supabase
        .from("EligibilityAssessment")
        .update({ notified_at: null, updated_at: staleDate })
        .neq("organisation_id", "");

      if (orgId) {
        resetQuery = resetQuery.eq("organisation_id", orgId);
      }
      await resetQuery;
      console.info(
        `[internal/eligibility-refresh] Reset ${orgId ? `org ${orgId}` : "all"} caches and notification timestamps`
      );
    }

    const result = orgId
      ? await runEligibilityRefreshJob({
          orgIdsFilter: new Set([orgId]),
          bypassCache: true,
          refreshReason: "internal.manual",
        })
      : await enqueueEligibilityRefreshes({
          source: "internal.manual.enqueue",
          dueOnly: false,
        });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error("[internal/eligibility-refresh]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
