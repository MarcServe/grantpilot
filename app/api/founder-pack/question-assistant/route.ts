import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveOrg } from "@/lib/auth";
import { generateFounderPackQuestionAnswers } from "@/lib/founder-pack";
import {
  MAX_FOUNDER_PACK_GRANT_CONTEXT_CHARS,
  assembleFounderPackGrantContext,
} from "@/lib/founder-pack-context";
import { recordUsage } from "@/lib/plan-check";
import { planAllowsForOrg } from "@/lib/plan-features";
import { getSupabaseAdmin } from "@/lib/supabase";

const questionSchema = z.object({
  question: z.string().min(5).max(2000),
  wordLimit: z.number().int().min(30).max(1500).optional(),
  guidance: z.string().max(1000).optional(),
});

const requestSchema = z.object({
  profileId: z.string().min(1),
  applicationId: z.string().min(1).optional(),
  eligibleGrantId: z.string().min(1).optional(),
  selectedApplicationIds: z.array(z.string().min(1)).max(5).optional(),
  selectedEligibleGrantIds: z.array(z.string().min(1)).max(5).optional(),
  pastedGrantContext: z.string().max(8000).optional(),
  questions: z.array(questionSchema).min(1).max(8),
  outputMode: z.enum(["draft_answer", "evidence_check", "improve_existing_answer"]).optional(),
  existingAnswer: z.string().max(6000).optional(),
});

function uniqueIds(...groups: Array<string[] | undefined>): string[] {
  return [...new Set(groups.flatMap((group) => group ?? []).map((id) => id.trim()).filter(Boolean))];
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { org, orgId } = await getActiveOrg();
    const body = await req.json().catch(() => ({}));
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid question assistant inputs", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const hasFounderPackAccess = planAllowsForOrg(org, "founder_pack");
    let usingFreeQuestionPreview = false;
    if (!hasFounderPackAccess) {
      if (parsed.data.questions.length > 1) {
        return NextResponse.json(
          { error: "The free Founder Pack preview supports one grant question. Upgrade to draft the full application." },
          { status: 402 }
        );
      }
      const { count: previewCount, error: previewCountError } = await supabase
        .from("Usage")
        .select("id", { count: "exact", head: true })
        .eq("organisationId", orgId)
        .eq("type", "founder_pack_free_answer");
      if (previewCountError) {
        return NextResponse.json({ error: previewCountError.message }, { status: 502 });
      }
      if ((previewCount ?? 0) > 0) {
        return NextResponse.json(
          {
            error:
              "Your free Founder Pack answer preview has already been used. Upgrade to continue drafting and export the full pack.",
          },
          { status: 402 }
        );
      }
      usingFreeQuestionPreview = true;
    }

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

    const profileId = parsed.data.profileId;
    const applicationIds = uniqueIds(
      parsed.data.applicationId ? [parsed.data.applicationId] : undefined,
      parsed.data.selectedApplicationIds
    ).slice(0, 5);
    const eligibleGrantIds = uniqueIds(
      parsed.data.eligibleGrantId ? [parsed.data.eligibleGrantId] : undefined,
      parsed.data.selectedEligibleGrantIds
    ).slice(0, 5);

    let applicationRows: Record<string, unknown>[] = [];
    if (applicationIds.length > 0) {
      const { data: appRows, error: appErr } = await supabase
        .from("Application")
        .select("id, status, profileId, grantId, Grant(id, name, funder, eligibility, description, objectives)")
        .eq("organisationId", orgId)
        .in("id", applicationIds);

      if (appErr) {
        return NextResponse.json({ error: appErr.message }, { status: 502 });
      }
      const rows = (appRows ?? []) as Record<string, unknown>[];
      if (rows.length !== applicationIds.length) {
        return NextResponse.json(
          { error: "One or more selected applications were not found or do not belong to your workspace." },
          { status: 400 }
        );
      }
      for (const row of rows) {
        const rowProfileId = String(row.profileId ?? row.profile_id ?? "");
        if (rowProfileId !== profileId) {
          return NextResponse.json(
            { error: "Each selected application must use the same business profile chosen above." },
            { status: 400 }
          );
        }
      }
      applicationRows = rows;
    }

    let eligibilityRows: Record<string, unknown>[] = [];
    if (eligibleGrantIds.length > 0) {
      const { data: eligData, error: eligErr } = await supabase
        .from("EligibilityAssessment")
        .select(
          "grant_id, profile_id, organisation_id, score, decision, summary, reasons, missing_criteria, met_criteria, Grant(id, name, funder, eligibility, description, objectives)"
        )
        .eq("organisation_id", orgId)
        .eq("profile_id", profileId)
        .in("grant_id", eligibleGrantIds);

      if (eligErr) {
        return NextResponse.json({ error: eligErr.message }, { status: 502 });
      }
      eligibilityRows = (eligData ?? []) as Record<string, unknown>[];
    }

    const matchedEligibilityGrantIds = new Set(
      eligibilityRows.map((row) => String(row.grant_id ?? "").trim()).filter(Boolean)
    );
    const standaloneGrantIds = eligibleGrantIds.filter((id) => !matchedEligibilityGrantIds.has(id));
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
      parsed.data.pastedGrantContext
    );
    const trimmedGrantContext = grantContext?.trim()
      ? grantContext.trim().slice(0, MAX_FOUNDER_PACK_GRANT_CONTEXT_CHARS)
      : undefined;

    const result = await generateFounderPackQuestionAnswers(
      profile as Record<string, unknown>,
      {
        questions: parsed.data.questions,
        outputMode: parsed.data.outputMode,
        existingAnswer: parsed.data.existingAnswer?.trim() || undefined,
        pastedGrantContext: parsed.data.pastedGrantContext?.trim() || undefined,
      },
      trimmedGrantContext
    );

    if (usingFreeQuestionPreview) {
      await recordUsage(orgId, "founder_pack_free_answer").catch((error) => {
        console.error("[FOUNDER_PACK_QUESTION_ASSISTANT_PREVIEW_USAGE]", error);
      });
    }

    return NextResponse.json({
      ...result,
      progressiveAccess: {
        previewUsed: usingFreeQuestionPreview,
        paidAccess: hasFounderPackAccess,
      },
    });
  } catch (error) {
    console.error("[FOUNDER_PACK_QUESTION_ASSISTANT]", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
