import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { applicantReviewView, EXPERT_REVIEW_COLUMNS, type ExpertGrantReview } from "@/lib/expert-grant-review";
const headers = { "Cache-Control": "no-store" };
async function handle(req: Request, params: Promise<{ id: string }>, create: boolean) {
  const { orgId, user } = await getActiveOrg();
  const { id } = await params;
  const db = getSupabaseAdmin();
  const app = await db.from("Application").select("id").eq("id", id).eq("organisationId", orgId).maybeSingle();
  if (app.error) return NextResponse.json({ error: "Could not load the application." }, { status: 502, headers });
  if (!app.data) return NextResponse.json({ error: "Application not found." }, { status: 404, headers });
  if (create) {
    const body = await req.json().catch(() => null);
    if (body?.consent !== true) return NextResponse.json({ error: "Confirm that your saved application feedback may be reviewed." }, { status: 400, headers });
    const outcome = await db.from("ApplicationOutcome").select("outcome").eq("applicationId", id).eq("organisationId", orgId).maybeSingle();
    if (outcome.error) return NextResponse.json({ error: "Could not check the saved outcome." }, { status: 502, headers });
    if (outcome.data?.outcome !== "rejected") return NextResponse.json({ error: "Save the unsuccessful outcome and feedback first." }, { status: 400, headers });
    const result = await db.from("ExpertGrantReview").upsert({ organisationId: orgId, applicationId: id, requestedById: user.id }, { onConflict: "applicationId", ignoreDuplicates: true });
    if (result.error) return NextResponse.json({ error: "Expert review requests are not available yet. The administrator may need to apply migration 070." }, { status: 503, headers });
  }
  const result = await db.from("ExpertGrantReview").select(EXPERT_REVIEW_COLUMNS).eq("applicationId", id).eq("organisationId", orgId).maybeSingle();
  if (result.error) return NextResponse.json({ error: "Expert reviews are not available yet. Please try again after setup." }, { status: 503, headers });
  return NextResponse.json({ review: result.data ? applicantReviewView(result.data as ExpertGrantReview) : null }, { headers });
}
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) { return handle(req, params, false); }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) { return handle(req, params, true); }
