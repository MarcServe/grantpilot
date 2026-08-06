import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { eligibilityFactSchema } from "@/lib/validations/profile";
import { mergeEligibilityFacts } from "@/lib/eligibility-facts";
import { syncGrantMemoryFromProfile } from "@/lib/grant-memory";
import { generateAndStoreProfileEmbedding } from "@/lib/embeddings";
import {
  requestEligibilityRefresh,
  requestProfileEligibilityBackfill,
} from "@/lib/eligibility-refresh-trigger";
import { clearEligibleMatchCaches } from "@/lib/eligible-match-cache";

const scalarFields = z.object({
  fundingUrgency: z.string().max(120).optional(),
  fundingPosition: z.string().max(180).optional(),
  documentReadiness: z.string().max(120).optional(),
  previousGrantHistory: z.string().max(2000).optional(),
  employeeCount: z.coerce.number().int().min(0).optional(),
  annualRevenue: z.coerce.number().min(0).optional(),
  businessStage: z.string().max(120).optional(),
  businessSizeBand: z.string().max(120).optional(),
  legalStructure: z.string().max(120).optional(),
  coFundingCapacity: z.string().max(120).optional(),
  reimbursementReadiness: z.string().max(120).optional(),
  localAuthority: z.string().max(160).optional(),
  areasServed: z.string().max(1000).optional(),
});

const quickFactsSchema = z.object({
  profileId: z.string().min(1).optional(),
  fields: scalarFields.default({}),
  eligibilityFacts: z.array(eligibilityFactSchema).max(12).optional(),
});

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { orgId, activeProfileId, org } = await getActiveOrg();
    const parsed = quickFactsSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid profile fact update" }, { status: 400 });
    }

    const profileId = parsed.data.profileId ?? activeProfileId ?? org.profiles?.[0]?.id;
    if (!profileId) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const supabase = getSupabaseAdmin();
    const { data: profile } = await supabase
      .from("BusinessProfile")
      .select("id, eligibilityFacts")
      .eq("id", profileId)
      .eq("organisationId", orgId)
      .maybeSingle();

    if (!profile?.id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed.data.fields)) {
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed) updates[key] = trimmed;
      } else if (typeof value === "number" && Number.isFinite(value)) {
        updates[key] = value;
      }
    }

    if (parsed.data.eligibilityFacts?.length) {
      const confirmedFacts = parsed.data.eligibilityFacts.map((fact) => ({
        ...fact,
        source: "manual" as const,
        confidence: "confirmed" as const,
      }));
      updates.eligibilityFacts = mergeEligibilityFacts(profile.eligibilityFacts, confirmedFacts);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Add at least one confirmed profile fact" }, { status: 400 });
    }

    const { error } = await supabase
      .from("BusinessProfile")
      .update(updates)
      .eq("id", profile.id)
      .eq("organisationId", orgId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    await syncGrantMemoryFromProfile(profile.id, orgId).catch(() => {});
    generateAndStoreProfileEmbedding(profile.id).catch(() => {});
    clearEligibleMatchCaches();
    await requestEligibilityRefresh(orgId, "profile.quick_facts.updated");
    await requestProfileEligibilityBackfill(orgId, profile.id, "profile.quick_facts.updated");

    return NextResponse.json({ ok: true, updated: Object.keys(updates) });
  } catch (error) {
    console.error("[PROFILE_QUICK_FACTS]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
