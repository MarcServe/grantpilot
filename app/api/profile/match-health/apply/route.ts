import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { planAllowsForOrg, PLAN_CAPABILITY_MESSAGES } from "@/lib/plan-features";
import { syncGrantMemoryFromProfile } from "@/lib/grant-memory";
import { requestEligibilityRefresh } from "@/lib/eligibility-refresh-trigger";
import { generateAndStoreProfileEmbedding } from "@/lib/embeddings";
import { FUNDING_PURPOSES } from "@/lib/validations/profile";

const ALLOWED_TEXT_FIELDS = [
  "missionStatement",
  "description",
  "fundingDetails",
  "innovationCapabilities",
  "socialImpact",
  "teamExpertise",
] as const;

const applySchema = z.object({
  updates: z
    .object({
      missionStatement: z.string().min(8).optional(),
      description: z.string().min(8).optional(),
      fundingDetails: z.string().min(8).optional(),
      innovationCapabilities: z.string().min(8).optional(),
      socialImpact: z.string().min(8).optional(),
      teamExpertise: z.string().min(8).optional(),
      fundingPurposes: z.array(z.string()).optional(),
    })
    .default({}),
});

async function recalcCompletionScore(profileId: string) {
  const supabase = getSupabaseAdmin();
  const { data: profile } = await supabase.from("BusinessProfile").select("*").eq("id", profileId).maybeSingle();
  if (!profile) return;
  const { count } = await supabase
    .from("ProfileDocument")
    .select("id", { count: "exact", head: true })
    .eq("profileId", profileId);

  let score = 0;
  if (profile.businessName) score++;
  if (profile.sector) score++;
  if (profile.location) score++;
  if (profile.websiteUrl) score++;
  if (profile.missionStatement) score++;
  if (profile.description) score++;
  if (profile.fundingMin != null && Number(profile.fundingMin) >= 0) score++;
  if (profile.fundingMax != null && Number(profile.fundingMax) >= 0) score++;
  if (Array.isArray(profile.fundingPurposes) && profile.fundingPurposes.length > 0) score++;
  if (profile.innovationCapabilities || profile.socialImpact || profile.teamExpertise) score++;
  if ((count ?? 0) >= 1) score++;

  await supabase
    .from("BusinessProfile")
    .update({ completionScore: Math.round((score / 11) * 100) })
    .eq("id", profileId);
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { orgId, org } = await getActiveOrg();
    if (!planAllowsForOrg(org, "company_dna_ai")) {
      return NextResponse.json(
        { error: PLAN_CAPABILITY_MESSAGES.company_dna_ai, code: "FEATURE_FORBIDDEN" },
        { status: 402 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const parsed = applySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid profile updates" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    for (const field of ALLOWED_TEXT_FIELDS) {
      const value = parsed.data.updates[field];
      if (typeof value === "string" && value.trim().length >= 8) {
        updates[field] = value.trim();
      }
    }
    if (Array.isArray(parsed.data.updates.fundingPurposes)) {
      const allowed = new Set<string>(FUNDING_PURPOSES as readonly string[]);
      const values = [...new Set(parsed.data.updates.fundingPurposes.map((value) => value.trim()))]
        .filter((value) => allowed.has(value))
        .slice(0, 12);
      if (values.length > 0) updates.fundingPurposes = values;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Select at least one safe Business DNA improvement to apply" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: profile } = await supabase
      .from("BusinessProfile")
      .select("id")
      .eq("organisationId", orgId)
      .maybeSingle();
    if (!profile?.id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const { error } = await supabase
      .from("BusinessProfile")
      .update(updates)
      .eq("id", profile.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    await recalcCompletionScore(profile.id);
    await syncGrantMemoryFromProfile(profile.id, orgId).catch(() => {});
    generateAndStoreProfileEmbedding(profile.id).catch(() => {});
    await requestEligibilityRefresh(orgId, "profile.match_health.applied");

    return NextResponse.json({ ok: true, applied: Object.keys(updates) });
  } catch (error) {
    console.error("[PROFILE_MATCH_HEALTH_APPLY]", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
