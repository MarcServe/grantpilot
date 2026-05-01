import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { FOUNDER_PACK_DOCUMENT_TYPES, generateFounderPack } from "@/lib/founder-pack";
import { recordUsage } from "@/lib/plan-check";

const documentTypeValues = FOUNDER_PACK_DOCUMENT_TYPES.map((item) => item.value) as [
  (typeof FOUNDER_PACK_DOCUMENT_TYPES)[number]["value"],
  ...(typeof FOUNDER_PACK_DOCUMENT_TYPES)[number]["value"][],
];

const requestSchema = z.object({
  profileId: z.string().min(1),
  founderName: z.string().min(2).max(120),
  founderRole: z.string().min(2).max(160),
  founderBackground: z.string().min(20).max(4000),
  technicalContribution: z.string().min(20).max(4000),
  targetUse: z.enum(["innovator_founder_visa", "funding_readiness", "accelerator_investor"]).default("innovator_founder_visa"),
  documentTypes: z.array(z.enum(documentTypeValues)).min(1).default(documentTypeValues),
  marketFocus: z.string().min(10).max(2500),
  revenueModel: z.string().min(10).max(2500),
  pricingAssumptions: z.string().min(10).max(2500),
  hiringPlan: z.string().min(10).max(2500),
  additionalNotes: z.string().max(2500).optional(),
});

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { org, orgId, user } = await getActiveOrg();
    const plan = String((org as { plan?: string } | undefined)?.plan ?? "FREE_TRIAL");
    if (plan === "FREE_TRIAL") {
      return NextResponse.json(
        { error: "Founder Funding Pack is available on Pro and Business plans." },
        { status: 402 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid pack inputs", details: parsed.error.flatten() }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: profile, error: profileError } = await supabase
      .from("BusinessProfile")
      .select("*")
      .eq("id", parsed.data.profileId)
      .eq("organisationId", orgId)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 502 });
    }
    if (!profile) {
      return NextResponse.json({ error: "Business profile not found" }, { status: 404 });
    }

    const content = await generateFounderPack(profile as Record<string, unknown>, parsed.data);
    const { data: pack, error: insertError } = await supabase
      .from("FounderFundingPack")
      .insert({
        organisationId: orgId,
        profileId: parsed.data.profileId,
        createdById: (user as { id?: string }).id ?? null,
        type: parsed.data.targetUse,
        status: "generated",
        inputs: parsed.data,
        content,
      })
      .select("id, createdAt, content")
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 502 });
    }

    await recordUsage(orgId, "founder_pack").catch(() => {});

    return NextResponse.json({ pack });
  } catch (e) {
    console.error("[FOUNDER_PACK_GENERATE]", e);
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
