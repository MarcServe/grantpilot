import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { expertAdviceSchema, EXPERT_REVIEW_COLUMNS } from "@/lib/expert-grant-review";
const headers = { "Cache-Control": "no-store" };
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Admin access required." }, { status: 403, headers });
  const db = getSupabaseAdmin();
  const result = await db.from("ExpertGrantReview").select(`${EXPERT_REVIEW_COLUMNS},Application(id,Grant(name,funder),BusinessProfile(businessName,sector,description,missionStatement,teamExpertise,fundingDetails))`).order("status", { ascending: false }).order("requestedAt", { ascending: false }).limit(100);
  if (result.error) return NextResponse.json({ error: "Could not load requests. Apply migration 070 if this is the first setup." }, { status: 503, headers });
  const ids = (result.data ?? []).map(r => r.applicationId);
  const evidence = ids.length ? await db.from("ApplicationOutcome").select("applicationId,outcome,funderFeedback,responseText").in("applicationId", ids) : { data: [], error: null };
  if (evidence.error) return NextResponse.json({ error: "Could not load saved funder feedback." }, { status: 502, headers });
  const byId = new Map((evidence.data ?? []).map(row => [row.applicationId, row]));
  return NextResponse.json({ reviews: (result.data ?? []).map(row => ({ ...row, evidence: byId.get(row.applicationId) ?? null })) }, { headers });
}
export async function PATCH(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Admin access required." }, { status: 403, headers });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401, headers });
  const body = await req.json().catch(() => null);
  const parsed = expertAdviceSchema.safeParse(body);
  if (!parsed.success || typeof body?.id !== "string") return NextResponse.json({ error: "Provide the expert's name, expertise, track-record links, verification and review text. Reopen the request if it changed." }, { status: 400, headers });
  const { expectedUpdatedAt, verifiedTrackRecord: _verified, ...values } = parsed.data;
  void _verified;
  const result = await getSupabaseAdmin().from("ExpertGrantReview").update({ ...values, trackRecordVerifiedById: user.id, publishedById: values.status === "completed" ? user.id : null, reviewedAt: values.status === "completed" ? new Date().toISOString() : null, updatedAt: new Date().toISOString() }).eq("id", body.id).eq("updatedAt", expectedUpdatedAt).select(EXPERT_REVIEW_COLUMNS).maybeSingle();
  if (result.error) return NextResponse.json({ error: "Could not save expert review." }, { status: 502, headers });
  if (!result.data) return NextResponse.json({ error: "This request changed. Reload before saving." }, { status: 409, headers });
  return NextResponse.json({ review: result.data }, { headers });
}
