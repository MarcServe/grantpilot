import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { criteriaEnabled } from "@/lib/criteria-flags";
import { loadCriteria } from "@/lib/criteria-store";
import { isGrantActionableNow } from "@/lib/grant-actionability";
import { queueCriteriaRefresh } from "@/lib/criteria-refresh";
import { getProfileMatches } from "@/lib/profile-matches";
import { checkUsageLimit } from "@/lib/plan-check";
const schema = z.object({
  reextract: z.boolean().default(false),
  answers: z
    .array(
      z.object({
        criterionId: z.string(),
        value: z.boolean(),
        evidence: z.string().trim().min(1).max(2000),
        sourceVersion: z.string(),
      }),
    )
    .max(100)
    .default([]),
});
async function context(id: string) {
  if (!criteriaEnabled()) throw new Error("Feature unavailable");
  const { orgId, activeProfileId, org } = await getActiveOrg();
  const profileId = activeProfileId ?? org.profiles?.[0]?.id;
  if (!profileId) throw new Error("Profile required");
  const db = getSupabaseAdmin();
  const [p, g] = await Promise.all([
    db
      .from("BusinessProfile")
      .select("*")
      .eq("organisationId", orgId)
      .eq("id", profileId)
      .single(),
    db.from("Grant").select("*").eq("id", id).single(),
  ]);
  if (p.error || g.error) throw new Error("Profile or grant not found");
  return { orgId, profileId, db, profile: p.data, grant: g.data };
}
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const c = await context(id);
    const data = await loadCriteria(c.orgId, c.profileId, [id]);
    const latest = await c.db
      .from("criteria_refresh_runs")
      .select("id,status,error,result")
      .eq("organisation_id", c.orgId)
      .eq("profile_id", c.profileId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest.error) throw new Error(latest.error.message);
    return NextResponse.json(
      {
        latestRefresh: latest.data,
        assessment: data.assess(id, c.profile),
        document: data.documents.get(id) ?? null,
        actionable: isGrantActionableNow(c.grant),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unable to load verification" },
      { status: 400 },
    );
  }
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const c = await context(id);
    const body = schema.parse(await req.json());
    if (!isGrantActionableNow(c.grant))
      return NextResponse.json(
        { error: "This is not a current individual funding opportunity." },
        { status: 409 },
      );
    const limit = await checkUsageLimit(c.orgId, "match");
    if (!limit.allowed)
      return NextResponse.json(
        { error: "Your plan's eligibility allowance is exhausted." },
        { status: 403 },
      );
    const pending = await c.db
      .from("criteria_refresh_runs")
      .select("id")
      .eq("organisation_id", c.orgId)
      .eq("profile_id", c.profileId)
      .in("status", ["queued", "running"])
      .limit(1);
    if (pending.error) throw new Error(pending.error.message);
    if (pending.data?.length)
      return NextResponse.json(
        {
          error:
            "Wait for the current profile refresh to finish before changing answers.",
          refreshId: pending.data[0].id,
        },
        { status: 409 },
      );
    const portfolio = await getProfileMatches(c.orgId, c.profileId);
    const before = Object.fromEntries(
      Object.entries(portfolio.sections).flatMap(([s, rows]) =>
        rows.map((g) => [g.grantId, s]),
      ),
    );
    const data = await loadCriteria(c.orgId, c.profileId, [id]);
    const document = data.documents.get(id);
    for (const answer of body.answers)
      if (
        !document ||
        document.sourceVersion !== answer.sourceVersion ||
        !document.criteria.some((x) => x.id === answer.criterionId)
      )
        return NextResponse.json(
          { error: "The source changed. Reload criteria before confirming." },
          { status: 409 },
        );
    const saveAnswers = async () => {
      if (body.answers.length) {
        const saved = await c.db.from("grant_criteria_answers").upsert(
          body.answers.map((a) => ({
            organisation_id: c.orgId,
            profile_id: c.profileId,
            grant_id: id,
            criterion_id: a.criterionId,
            answer: {
              value: a.value,
              evidence: a.evidence,
              sourceVersion: a.sourceVersion,
              factValue: (() => {
                const field = document!.criteria.find(
                  (x) => x.id === a.criterionId,
                )?.field;
                return field ? (c.profile[field] ?? null) : null;
              })(),
            },
            updated_at: new Date().toISOString(),
          })),
          { onConflict: "organisation_id,profile_id,grant_id,criterion_id" },
        );
        if (saved.error) throw new Error(saved.error.message);
      }
    };
    const refreshId = await queueCriteriaRefresh(
      c.orgId,
      c.profileId,
      id,
      before,
      body.reextract || !document,
      saveAnswers,
    );
    return NextResponse.json({ refreshId }, { status: 202 });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Could not start verification",
      },
      { status: 400 },
    );
  }
}
