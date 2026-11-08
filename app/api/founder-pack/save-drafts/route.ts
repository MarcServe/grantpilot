import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { planAllowsForOrg } from "@/lib/plan-features";
import { normaliseContent } from "@/lib/founder-pack";
const schema = z.object({
  profileId: z.string().min(1), title: z.string().trim().min(2).max(200),
  selectedApplicationIds: z.array(z.string().min(1)).max(5).default([]),
  selectedEligibleGrantIds: z.array(z.string().min(1)).max(5).default([]),
  answers: z.array(z.object({ question: z.string().trim().min(1).max(12000), draftAnswer: z.string().trim().min(1).max(40000), missingEvidence: z.array(z.string().max(1000)).max(100).default([]), warnings: z.array(z.string().max(1000)).max(100).default([]) })).min(1).max(80),
});
export async function POST(request: Request) {
  try {
    const { org, orgId, user } = await getActiveOrg();
    if (!planAllowsForOrg(org, "founder_pack")) return NextResponse.json({ error: "Upgrade to save and export your completed application documents." }, { status: 402 });
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map(issue => issue.message).join(" ") }, { status: 400 });
    const data = parsed.data; const db = getSupabaseAdmin();
    const profile = await db.from("BusinessProfile").select("id").eq("id", data.profileId).eq("organisationId", orgId).maybeSingle();
    if (profile.error || !profile.data) return NextResponse.json({ error: "Business profile not found." }, { status: 404 });
    if (data.selectedApplicationIds.length) {
      const apps = await db.from("Application").select("id").eq("organisationId", orgId).eq("profileId", data.profileId).in("id", data.selectedApplicationIds);
      if (apps.error || new Set(apps.data?.map(app => app.id)).size !== new Set(data.selectedApplicationIds).size) return NextResponse.json({ error: "A selected application does not belong to this business." }, { status: 400 });
    }
    if (data.selectedEligibleGrantIds.length) {
      const grants = await db.from("Grant").select("id").in("id", data.selectedEligibleGrantIds);
      if (grants.error || new Set(grants.data?.map(grant => grant.id)).size !== new Set(data.selectedEligibleGrantIds).size) return NextResponse.json({ error: "A selected grant is unavailable." }, { status: 400 });
    }
    const content = normaliseContent({
      grantApplicationDraft: data.answers.map(answer => ({ question: answer.question, answer: answer.draftAnswer })),
      evidenceChecklist: [...new Set(data.answers.flatMap(answer => answer.missingEvidence))],
      nextSteps: [...new Set(data.answers.flatMap(answer => answer.warnings))],
    });
    const saved = await db.from("FounderFundingPack").insert({ organisationId: orgId, profileId: data.profileId, createdById: user.id, type: "funding_readiness", status: "generated", inputs: { packName: data.title, customDocumentTitle: data.title, documentTypes: ["grant_application_draft", "evidence_checklist", "next_steps"], selectedApplicationIds: data.selectedApplicationIds, selectedEligibleGrantIds: data.selectedEligibleGrantIds, draftOnly: true }, content }).select("id").single();
    if (saved.error) return NextResponse.json({ error: "The draft could not be saved. Your edited answers remain on this page; please retry." }, { status: 502 });
    return NextResponse.json({ id: saved.data.id }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Could not save the draft. Please retry." }, { status: 500 }); }
}
