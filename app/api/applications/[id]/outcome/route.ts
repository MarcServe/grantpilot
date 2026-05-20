import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  buildOutcomeProfileSummary,
  generateOutcomeLearningInsight,
  outcomeToScoreSignal,
  type FundingOutcome,
  type OutcomeLearningInsight,
} from "@/lib/outcome-learning";
import { requestEligibilityRefresh } from "@/lib/eligibility-refresh-trigger";
import { planAllowsForOrg } from "@/lib/plan-features";

const outcomeSchema = z.object({
  outcome: z.enum(["applied", "shortlisted", "awarded", "rejected", "withdrawn", "unknown"]),
  awardedAmount: z.number().nonnegative().nullable().optional(),
  funderFeedback: z.string().max(5000).optional(),
  responseText: z.string().max(8000).optional(),
  responseScreenshotName: z.string().max(240).optional(),
  responseScreenshotDataUrl: z.string().max(2_000_000).optional(),
  learningNotes: z.string().max(5000).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const { orgId, user, org } = await getActiveOrg();
    const body = await req.json().catch(() => ({}));
    const parsed = outcomeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid outcome", details: parsed.error.flatten() }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: application, error: appError } = await supabase
      .from("Application")
      .select("id, organisationId, grantId, profileId, Grant(name, funder), BusinessProfile(*)")
      .eq("id", id)
      .eq("organisationId", orgId)
      .maybeSingle();

    if (appError) return NextResponse.json({ error: appError.message }, { status: 502 });
    if (!application) return NextResponse.json({ error: "Application not found" }, { status: 404 });

    const grant = Array.isArray(application.Grant) ? application.Grant[0] : application.Grant;
    const profile = Array.isArray(application.BusinessProfile)
      ? application.BusinessProfile[0]
      : application.BusinessProfile;
    const outcome = parsed.data.outcome as FundingOutcome;
    const combinedFunderFeedback = [
      parsed.data.funderFeedback?.trim(),
      parsed.data.responseText?.trim() ? `Funder response text:\n${parsed.data.responseText.trim()}` : "",
      parsed.data.responseScreenshotDataUrl ? `Screenshot evidence uploaded: ${parsed.data.responseScreenshotName ?? "response screenshot"}` : "",
    ].filter(Boolean).join("\n\n");

    let insight: OutcomeLearningInsight;
    if (planAllowsForOrg(org as { plan?: string; createdAt?: string | Date | null }, "outcome_learning_ai")) {
      insight = await generateOutcomeLearningInsight({
        outcome,
        grantName: String((grant as { name?: string } | null)?.name ?? "Grant"),
        funder: String((grant as { funder?: string } | null)?.funder ?? "Funder"),
        profileSummary: buildOutcomeProfileSummary((profile ?? {}) as Record<string, unknown>),
        funderFeedback: combinedFunderFeedback || parsed.data.funderFeedback,
        learningNotes: parsed.data.learningNotes,
      }).catch(() => ({
        summary: "Outcome recorded.",
        strengths: [],
        weaknesses: [],
        nextActions: [],
        scoringAdjustment: outcomeToScoreSignal(outcome),
      }));
    } else {
      insight = {
        summary:
          "Outcome recorded. Upgrade to Growth, Pro, or Business for AI learning insights tailored to your grants and profile.",
        strengths: [],
        weaknesses: [],
        nextActions: [],
        scoringAdjustment: outcomeToScoreSignal(outcome),
      };
    }

    const { data: saved, error: upsertError } = await supabase
      .from("ApplicationOutcome")
      .upsert(
        {
          organisationId: orgId,
          applicationId: id,
          grantId: application.grantId,
          profileId: application.profileId,
          reportedById: (user as { id?: string }).id ?? null,
          outcome,
          awardedAmount: parsed.data.awardedAmount ?? null,
          funderFeedback: parsed.data.funderFeedback?.trim() || null,
          responseText: parsed.data.responseText?.trim() || null,
          responseScreenshotName: parsed.data.responseScreenshotName?.trim() || null,
          responseScreenshotDataUrl: parsed.data.responseScreenshotDataUrl?.trim() || null,
          learningNotes: JSON.stringify({
            userNotes: parsed.data.learningNotes?.trim() || null,
            responseEvidence: {
              hasText: Boolean(parsed.data.responseText?.trim()),
              hasScreenshot: Boolean(parsed.data.responseScreenshotDataUrl),
              screenshotName: parsed.data.responseScreenshotName?.trim() || null,
            },
            insight,
          }),
          reportedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        { onConflict: "applicationId" }
      )
      .select("*")
      .single();

    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 502 });

    if (outcome === "awarded" || outcome === "shortlisted" || outcome === "rejected") {
      const { data: assessment } = await supabase
        .from("EligibilityAssessment")
        .select("improvement_plan")
        .eq("organisation_id", orgId)
        .eq("profile_id", application.profileId)
        .eq("grant_id", application.grantId)
        .maybeSingle();
      const currentPlan =
        assessment?.improvement_plan && typeof assessment.improvement_plan === "object"
          ? (assessment.improvement_plan as Record<string, unknown>)
          : {};
      await supabase
        .from("EligibilityAssessment")
        .update({
          updated_at: new Date().toISOString(),
          improvement_plan: {
            ...currentPlan,
            outcomeLearning: insight,
          },
        })
        .eq("organisation_id", orgId)
        .eq("profile_id", application.profileId)
        .eq("grant_id", application.grantId);
    }

    await requestEligibilityRefresh(orgId, "application.outcome.recorded");
    return NextResponse.json({ outcome: saved, insight });
  } catch (e) {
    console.error("[APPLICATION_OUTCOME]", e);
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
