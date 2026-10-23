import { criteriaEnabled } from "@/lib/criteria-flags";
import { inngest } from "@/inngest/client";
import { checkUsageLimit } from "@/lib/plan-check";
import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!criteriaEnabled())
    return NextResponse.json({ error: "Feature unavailable" }, { status: 404 });
  const { orgId, activeProfileId } = await getActiveOrg();
  const { id } = await params;
  const { data, error } = await getSupabaseAdmin()
    .from("criteria_refresh_runs")
    .select("id,status,result,error,updated_at")
    .eq("id", id)
    .eq("organisation_id", orgId)
    .eq("profile_id", activeProfileId ?? "")
    .maybeSingle();
  if (error || !data)
    return NextResponse.json({ error: "Refresh not found" }, { status: 404 });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!criteriaEnabled())
    return NextResponse.json({ error: "Feature unavailable" }, { status: 404 });
  const { orgId, activeProfileId } = await getActiveOrg();
  const { id } = await params;
  const db = getSupabaseAdmin();
  const limit = await checkUsageLimit(orgId, "match");
  if (!limit.allowed)
    return NextResponse.json(
      { error: "Eligibility allowance exhausted" },
      { status: 403 },
    );
  const run = await db
    .from("criteria_refresh_runs")
    .select("*")
    .eq("id", id)
    .eq("organisation_id", orgId)
    .eq("profile_id", activeProfileId ?? "")
    .eq("status", "failed")
    .maybeSingle();
  if (!run.data || run.error)
    return NextResponse.json(
      { error: "Failed refresh not found" },
      { status: 404 },
    );
  const created = await db
    .from("criteria_refresh_runs")
    .insert({
      organisation_id: orgId,
      profile_id: activeProfileId,
      grant_id: run.data.grant_id,
      before_matches: run.data.before_matches,
      reextract: run.data.reextract,
    })
    .select("id")
    .single();
  if (created.error)
    return NextResponse.json(
      { error: "Another refresh is already active" },
      { status: 409 },
    );
  try {
    await inngest.send({
      name: "criteria/refresh.requested",
      data: { runId: created.data.id, profileId: activeProfileId },
    });
  } catch {
    await db
      .from("criteria_refresh_runs")
      .update({ status: "failed", error: "Could not queue refresh" })
      .eq("id", created.data.id);
  }
  return NextResponse.json({ refreshId: created.data.id }, { status: 202 });
}
