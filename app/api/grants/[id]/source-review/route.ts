import { sourceReviewErrorMessage } from "@/lib/source-review-errors";
import { resolveGrantSourceLinks } from "@/lib/grant-source-links";
import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { loadReviewedGrantDocuments } from "@/lib/reviewed-grant-context";
import { extractCriteriaDocument } from "@/lib/criteria-source";
import { assessCriteria } from "@/lib/criteria";
import { checkUsageLimit, recordUsage } from "@/lib/plan-check";
import { clearEligibleMatchCaches } from "@/lib/eligible-match-cache";
export const maxDuration = 180;

async function reviewContext(id: string) {
  const { orgId, activeProfileId, org } = await getActiveOrg();
  const profileId = activeProfileId ?? org.profiles?.[0]?.id;
  if (!profileId) throw new Error("Choose a business profile first.");
  const db = getSupabaseAdmin();
  const [profile, grant, stored] = await Promise.all([
    db.from("BusinessProfile").select("*").eq("id", profileId).eq("organisationId", orgId).single(),
    db.from("Grant").select("id,name,detailUrl,applicationUrl,directApplicationUrl,applicationUrlQuality").eq("id", id).single(),
    loadReviewedGrantDocuments(db, [id]),
  ]);
  if (profile.error || grant.error) throw new Error("Business profile or grant not found.");
  return { db, orgId, profileId, profile: profile.data, grant: grant.data, ...stored };
}
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const context = await reviewContext(id);
    const document = context.documents.get(id) ?? null;
    return NextResponse.json({ document, storageReady: context.storageReady, assessment: document ? assessCriteria(document, context.profile) : null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: sourceReviewErrorMessage(error) }, { status: 400 });
  }
}
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const context = await reviewContext(id);
    if (!context.storageReady) return NextResponse.json({ error: "Source review storage needs Supabase migration 065 before this review can be saved." }, { status: 503 });
    const limit = await checkUsageLimit(context.orgId, "match");
    if (!limit.allowed) return NextResponse.json({ error: "Your eligibility check allowance has been reached." }, { status: 402 });
    const sourceUrl = resolveGrantSourceLinks(context.grant).sourceUrl;
    if (!sourceUrl) return NextResponse.json({ error: "Add the official funder guidance URL first. A third-party listing is not a reviewed funder source." }, { status: 400 });
    const document = await extractCriteriaDocument(sourceUrl, context.grant.name);
    const saved = await context.db.from("grant_criteria_documents").upsert({ grant_id: id, document, updated_at: new Date().toISOString() });
    if (saved.error) throw new Error("The published source was read but could not be saved. Please retry.");
    await recordUsage(context.orgId, "match");
    clearEligibleMatchCaches();
    return NextResponse.json({ document, storageReady: true, assessment: assessCriteria(document, context.profile) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: sourceReviewErrorMessage(error) }, { status: 502 });
  }
}
