import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { loadCriteria } from "@/lib/criteria-store";
import { criteriaEnabled } from "@/lib/criteria-flags";
const schema = z
  .object({
    requirementId: z.string(),
    sourceVersion: z.string(),
    status: z.enum(["needed", "draft", "reviewed"]),
    evidence: z.string().trim().max(2000),
  })
  .refine(
    (v) => v.status !== "reviewed" || v.evidence.length > 0,
    "Explain which reviewed evidence satisfies this requirement",
  );
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!criteriaEnabled())
    return NextResponse.json({ error: "Feature unavailable" }, { status: 404 });
  const { id } = await params;
  const { orgId, activeProfileId } = await getActiveOrg();
  if (!activeProfileId)
    return NextResponse.json({ error: "Profile required" }, { status: 400 });
  const db = getSupabaseAdmin();
  const data = await loadCriteria(orgId, activeProfileId, [id]);
  const doc = data.documents.get(id);
  const checks = await db
    .from("grant_preparation_checks")
    .select("*")
    .eq("organisation_id", orgId)
    .eq("profile_id", activeProfileId)
    .eq("grant_id", id);
  const documents = await db
    .from("Document")
    .select("id,name")
    .eq("profileId", activeProfileId);
  if (checks.error || documents.error)
    return NextResponse.json(
      { error: "Unable to load preparation evidence" },
      { status: 500 },
    );
  return NextResponse.json(
    {
      workload: doc?.workload ?? [],
      sourceVersion: doc?.sourceVersion ?? "",
      coverage: data.assess(id, {}).coverage,
      checks: (checks.data ?? []).filter(
        (c) =>
          c.source_version === doc?.sourceVersion &&
          doc?.workload.some((w) => w.id === c.requirement_id),
      ),
      documents: documents.data ?? [],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!criteriaEnabled())
    return NextResponse.json({ error: "Feature unavailable" }, { status: 404 });
  const { id } = await params;
  const { orgId, activeProfileId } = await getActiveOrg();
  if (!activeProfileId)
    return NextResponse.json({ error: "Profile required" }, { status: 400 });
  const input = schema.safeParse(await request.json());
  if (!input.success)
    return NextResponse.json(
      { error: "Add a valid requirement and reviewed evidence" },
      { status: 400 },
    );
  const data = await loadCriteria(orgId, activeProfileId, [id]);
  const doc = data.documents.get(id);
  const b = input.data;
  if (
    !doc ||
    b.sourceVersion !== doc.sourceVersion ||
    !doc.workload.some((w) => w.id === b.requirementId)
  )
    return NextResponse.json(
      { error: "Requirements changed. Reload the checklist." },
      { status: 409 },
    );
  const saved = await getSupabaseAdmin()
    .from("grant_preparation_checks")
    .upsert(
      {
        organisation_id: orgId,
        profile_id: activeProfileId,
        grant_id: id,
        requirement_id: b.requirementId,
        source_version: b.sourceVersion,
        status: b.status,
        evidence: b.evidence,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organisation_id,profile_id,grant_id,requirement_id" },
    );
  return NextResponse.json(
    saved.error ? { error: "Could not save checklist" } : { ok: true },
    { status: saved.error ? 500 : 200 },
  );
}
