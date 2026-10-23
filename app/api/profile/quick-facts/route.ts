import { checkUsageLimit } from "@/lib/plan-check";
import { criteriaProfileCompletionScore } from "@/lib/profile-completion";
import { criteriaEnabled } from "@/lib/criteria-flags";
import { queueCriteriaRefresh } from "@/lib/criteria-refresh";
import { getProfileMatches } from "@/lib/profile-matches";
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

const numericInput = (schema: z.ZodNumber) =>
  z.preprocess(
    (v) => (typeof v === "string" && !v.trim() ? undefined : v),
    z.coerce.number().pipe(schema),
  );
const validDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v &&
      v <= new Date().toISOString().slice(0, 10),
    "Use a valid date, not in the future",
  );
const scalarFields = z.object({
  incorporationDate: validDate.optional(),
  tradingStartDate: validDate.optional(),
  coFundingAvailable: numericInput(z.number().min(0).max(1e12)).optional(),
  fundingDetails: z.string().trim().min(1).max(4000).optional(),
  location: z.string().trim().min(1).max(500).optional(),
  sector: z.string().trim().min(1).max(500).optional(),
  previousGrantExperience: z.string().max(2000).optional(),
  fundingUrgency: z.string().max(120).optional(),
  fundingPosition: z.string().max(180).optional(),
  documentReadiness: z.string().max(120).optional(),
  previousGrantHistory: z.string().max(2000).optional(),
  employeeCount: numericInput(z.number().int().min(0)).optional(),
  annualRevenue: numericInput(z.number().min(0)).optional(),
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
  grantId: z.string().min(1).optional(),
  fields: scalarFields.default({}),
  eligibilityFacts: z.array(eligibilityFactSchema).max(12).optional(),
});

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { orgId, activeProfileId, org } = await getActiveOrg();
    const parsed = quickFactsSchema.safeParse(
      await req.json().catch(() => ({})),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid profile fact update" },
        { status: 400 },
      );
    }

    const profileId =
      parsed.data.profileId ?? activeProfileId ?? org.profiles?.[0]?.id;
    if (!profileId) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const supabase = getSupabaseAdmin();
    const { data: profile } = await supabase
      .from("BusinessProfile")
      .select("*")
      .eq("id", profileId)
      .eq("organisationId", orgId)
      .maybeSingle();

    if (!profile?.id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    if (profileId !== activeProfileId)
      return NextResponse.json(
        { error: "Switch to this business profile before editing its facts." },
        { status: 409 },
      );
    let before: Record<string, string> | undefined;
    if (criteriaEnabled()) {
      const limit = await checkUsageLimit(orgId, "match");
      if (!limit.allowed)
        return NextResponse.json(
          { error: "Eligibility allowance exhausted" },
          { status: 403 },
        );
      const pending = await supabase
        .from("criteria_refresh_runs")
        .select("id")
        .eq("organisation_id", orgId)
        .eq("profile_id", profileId)
        .in("status", ["queued", "running"])
        .limit(1);
      if (pending.error) throw new Error(pending.error.message);
      if (pending.data?.length)
        return NextResponse.json(
          {
            error: "Wait for the current refresh before editing more facts.",
            refreshId: pending.data[0].id,
          },
          { status: 409 },
        );
      const portfolio = await getProfileMatches(orgId, profileId);
      before = Object.fromEntries(
        Object.entries(portfolio.sections).flatMap(([section, rows]) =>
          rows.map((g) => [g.grantId, section]),
        ),
      );
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
      updates.eligibilityFacts = mergeEligibilityFacts(
        profile.eligibilityFacts,
        confirmedFacts,
      );
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "Add at least one confirmed profile fact" },
        { status: 400 },
      );
    }

    if (criteriaEnabled())
      updates.completionScore = criteriaProfileCompletionScore({
        ...profile,
        ...updates,
      });
    const saveFacts = async () => {
      const { error } = await supabase
        .from("BusinessProfile")
        .update(updates)
        .eq("id", profile.id)
        .eq("organisationId", orgId);
      if (error) throw new Error(error.message);
      await syncGrantMemoryFromProfile(profile.id, orgId).catch(() => {});
      generateAndStoreProfileEmbedding(profile.id).catch(() => {});
      clearEligibleMatchCaches();
    };
    if (criteriaEnabled()) {
      const refreshId = await queueCriteriaRefresh(
        orgId,
        profile.id,
        parsed.data.grantId ?? null,
        before,
        false,
        saveFacts,
      );
      return NextResponse.json(
        { ok: true, updated: Object.keys(updates), refreshId },
        { status: 202 },
      );
    }
    await saveFacts();
    await requestEligibilityRefresh(orgId, "profile.quick_facts.updated");
    await requestProfileEligibilityBackfill(
      orgId,
      profile.id,
      "profile.quick_facts.updated",
    );

    return NextResponse.json({ ok: true, updated: Object.keys(updates) });
  } catch (error) {
    console.error("[PROFILE_QUICK_FACTS]", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}
