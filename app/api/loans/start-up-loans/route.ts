import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveOrg, getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { loanIntakeSchema, assessLoanIntake } from "@/lib/start-up-loan-readiness";
import { START_UP_LOANS } from "@/lib/start-up-loans-preparation";
const headers = { "Cache-Control": "no-store" };
const saveSchema = z.object({ profileId: z.string().min(1), expectedUpdatedAt: z.string().datetime({ offset: true }).nullable(), answers: loanIntakeSchema });
export async function GET() {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "Sign in to load your saved intake." }, { status: 401, headers });
  const { orgId, activeProfileId, user } = await getActiveOrg();
  if (!activeProfileId) return NextResponse.json({ error: "Create or select a business profile first." }, { status: 400, headers });
  if (!user.id) return NextResponse.json({ error: "Applicant identity unavailable." }, { status: 401, headers });
  const db = getSupabaseAdmin();
  const [profile, draft] = await Promise.all([
    db.from("BusinessProfile").select("businessName,description,tradingStartDate").eq("organisationId", orgId).eq("id", activeProfileId).maybeSingle(),
    db.from("StartUpLoanIntake").select("answers,updatedAt").eq("organisationId", orgId).eq("profileId", activeProfileId).eq("applicantId", user.id).maybeSingle(),
  ]);
  if (profile.error || !profile.data) return NextResponse.json({ error: "Could not load business details." }, { status: 502, headers });
  if (draft.error && !["42P01", "PGRST205", "PGRST204"].includes(draft.error.code)) return NextResponse.json({ error: "Could not load your saved intake. Retry before making changes." }, { status: 502, headers });
  return NextResponse.json({ profileId: activeProfileId, prefill: { businessName: profile.data.businessName ?? "", activityDescription: profile.data.description ?? "", tradingStartDate: profile.data.tradingStartDate?.slice(0,10) ?? "" }, draft: draft.data?.answers ?? null, updatedAt: draft.data?.updatedAt ?? null, storageReady: !draft.error }, { headers });
}
export async function POST(req: Request) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "Sign in to save this intake." }, { status: 401, headers });
  const { orgId, activeProfileId, user } = await getActiveOrg();
  const parsed = saveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400, headers });
  if (!activeProfileId || parsed.data.profileId !== activeProfileId) return NextResponse.json({ error: "Your selected business changed. Reload the intake before saving." }, { status: 409, headers });
  if (!user.id) return NextResponse.json({ error: "Applicant identity unavailable." }, { status: 401, headers });
  const db = getSupabaseAdmin();
  const profile = await db.from("BusinessProfile").select("id").eq("organisationId", orgId).eq("id", activeProfileId).maybeSingle();
  if (profile.error || !profile.data) return NextResponse.json({ error: "Business profile unavailable." }, { status: 404, headers });
  const values = { answers: parsed.data.answers, shareWithAdviser: parsed.data.answers.shareWithAdviser, sourceVersion: START_UP_LOANS.checkedAt, updatedAt: new Date().toISOString() };
  const query = parsed.data.expectedUpdatedAt
    ? db.from("StartUpLoanIntake").update(values).eq("organisationId", orgId).eq("profileId", activeProfileId).eq("applicantId", user.id).eq("updatedAt", parsed.data.expectedUpdatedAt)
    : db.from("StartUpLoanIntake").insert({ ...values, organisationId: orgId, profileId: activeProfileId, applicantId: user.id });
  const result = await query.select("updatedAt").maybeSingle();
  if (result.error?.code === "23505" || (!result.error && !result.data)) return NextResponse.json({ error: "A newer intake exists. Reload before saving to avoid overwriting it." }, { status: 409, headers });
  if (result.error) return NextResponse.json({ error: "Could not save. Apply migration 071 if the intake table has not been set up." }, { status: 503, headers });
  if (!result.data) return NextResponse.json({ error: "A newer intake exists. Reload before saving." }, { status: 409, headers });
  return NextResponse.json({ updatedAt: result.data.updatedAt, report: assessLoanIntake(parsed.data.answers) }, { headers });
}
