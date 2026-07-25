import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { FOUNDER_PACK_DOCUMENT_TYPES, generateFounderPack } from "@/lib/founder-pack";
import {
  MAX_FOUNDER_PACK_GRANT_CONTEXT_CHARS,
  assembleFounderPackGrantContext,
} from "@/lib/founder-pack-context";
import { recordUsage } from "@/lib/plan-check";
import { planAllowsForOrg, PLAN_CAPABILITY_MESSAGES } from "@/lib/plan-features";

const documentTypeValues = FOUNDER_PACK_DOCUMENT_TYPES.map((item) => item.value) as [
  (typeof FOUNDER_PACK_DOCUMENT_TYPES)[number]["value"],
  ...(typeof FOUNDER_PACK_DOCUMENT_TYPES)[number]["value"][],
];

const requestSchema = z.object({
  profileId: z.string().min(1),
  founderName: z.string().max(120).optional().default(""),
  founderRole: z.string().max(160).optional().default(""),
  founderBackground: z.string().min(20).max(4000),
  technicalContribution: z.string().min(20).max(4000),
  targetUse: z.enum(["innovator_founder_visa", "funding_readiness", "accelerator_investor"]).default("innovator_founder_visa"),
  documentTypes: z.array(z.enum(documentTypeValues)).min(1),
  marketFocus: z.string().min(10).max(2500),
  revenueModel: z.string().min(10).max(2500),
  pricingAssumptions: z.string().min(10).max(2500),
  hiringPlan: z.string().min(10).max(2500),
  additionalNotes: z.string().max(2500).optional(),
  selectedApplicationIds: z.array(z.string().min(1)).max(15).optional(),
  selectedEligibleGrantIds: z.array(z.string().min(1)).max(15).optional(),
  grantRequirementsNotes: z.string().max(8000).optional(),
});

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { org, orgId, user } = await getActiveOrg();
    if (!planAllowsForOrg(org, "founder_pack")) {
      return NextResponse.json(
        { error: PLAN_CAPABILITY_MESSAGES.founder_pack },
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

    const firstDirector = String((profile as Record<string, unknown>).directorNames ?? "")
      .split(/\n|,|;/)
      .map((item) => item.trim())
      .find(Boolean);
    const fallbackFounderName =
      parsed.data.founderName.trim() ||
      String((profile as Record<string, unknown>).primaryContactName ?? "").trim() ||
      firstDirector ||
      "Founder";
    const fallbackFounderRole =
      parsed.data.founderRole.trim() ||
      String((profile as Record<string, unknown>).primaryContactRole ?? "").trim() ||
      "Founder";
    const inputs = {
      ...parsed.data,
      founderName: fallbackFounderName,
      founderRole: fallbackFounderRole,
    };

    const profileId = inputs.profileId;
    const uniqueAppIds = [...new Set(inputs.selectedApplicationIds ?? [])];
    const uniqueEligGrantIds = [...new Set(inputs.selectedEligibleGrantIds ?? [])];

    let applicationRows: Record<string, unknown>[] = [];

    if (uniqueAppIds.length > 0) {
      const { data: appRows, error: appErr } = await supabase
        .from("Application")
        .select("id, status, profileId, grantId, Grant(id, name, funder, eligibility, description, objectives)")
        .eq("organisationId", orgId)
        .in("id", uniqueAppIds);

      if (appErr) {
        return NextResponse.json({ error: appErr.message }, { status: 502 });
      }
      const rows = (appRows ?? []) as Record<string, unknown>[];
      if (rows.length !== uniqueAppIds.length) {
        return NextResponse.json(
          { error: "One or more selected applications were not found or do not belong to your workspace." },
          { status: 400 }
        );
      }
      for (const row of rows) {
        const pid = String(row.profileId ?? row.profile_id ?? "");
        if (pid !== profileId) {
          return NextResponse.json(
            { error: "Each selected application must use the same business profile chosen above." },
            { status: 400 }
          );
        }
      }
      applicationRows = rows;
    }

    let eligibilityRows: Record<string, unknown>[] = [];

    if (uniqueEligGrantIds.length > 0) {
      const { data: eligData, error: eligErr } = await supabase
        .from("EligibilityAssessment")
        .select(
          "grant_id, profile_id, organisation_id, score, decision, summary, reasons, missing_criteria, met_criteria, Grant(id, name, funder, eligibility, description, objectives)"
        )
        .eq("organisation_id", orgId)
        .eq("profile_id", profileId)
        .in("grant_id", uniqueEligGrantIds);

      if (eligErr) {
        return NextResponse.json({ error: eligErr.message }, { status: 502 });
      }
      const rows = (eligData ?? []) as Record<string, unknown>[];
      eligibilityRows = rows;
    }

    const matchedEligibilityGrantIds = new Set(eligibilityRows.map((row) => String(row.grant_id ?? "").trim()).filter(Boolean));
    const standaloneGrantIds = uniqueEligGrantIds.filter((id) => !matchedEligibilityGrantIds.has(id));
    let standaloneGrantRows: Record<string, unknown>[] = [];
    if (standaloneGrantIds.length > 0) {
      const { data: grants, error: grantError } = await supabase
        .from("Grant")
        .select("id, name, funder, deadline, eligibility, description, objectives")
        .in("id", standaloneGrantIds);
      if (grantError) return NextResponse.json({ error: grantError.message }, { status: 502 });
      standaloneGrantRows = (grants ?? []) as Record<string, unknown>[];
    }

    const grantContext = assembleFounderPackGrantContext(
      applicationRows,
      eligibilityRows,
      standaloneGrantRows,
      inputs.grantRequirementsNotes
    );

    const trimmedCtx = grantContext?.trim()
      ? grantContext.trim().slice(0, MAX_FOUNDER_PACK_GRANT_CONTEXT_CHARS)
      : undefined;

    const content = await generateFounderPack(profile as Record<string, unknown>, inputs, trimmedCtx);
    const { data: pack, error: insertError } = await supabase
      .from("FounderFundingPack")
      .insert({
        organisationId: orgId,
        profileId: inputs.profileId,
        createdById: (user as { id?: string }).id ?? null,
        type: inputs.targetUse,
        status: "generated",
        inputs,
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
