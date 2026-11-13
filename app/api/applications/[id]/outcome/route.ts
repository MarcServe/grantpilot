import { loadExpertAdviceContext } from "@/lib/expert-review-context";
import { loadReviewedGrantDocuments, appendPublishedRequirements } from "@/lib/reviewed-grant-context";
import { revalidatePath } from "next/cache";
import { rejectionReviewSchema, rejectionReviewContext, EMPTY_REJECTION_REVIEW } from "@/lib/rejection-review";
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
import { formatApplicationDuration } from "@/lib/application-duration";

const outcomeSchema = z.object({
  outcome: z.enum(["applied", "shortlisted", "awarded", "rejected", "withdrawn", "unknown"]),
  awardedAmount: z.number().nonnegative().nullable().optional(),
  funderFeedback: z.string().max(5000).optional(),
  responseText: z.string().max(8000).optional(),
  responseScreenshotName: z.string().max(240).optional(),
  responseScreenshotDataUrl: z.string().max(2_000_000).optional(),
  actualApplicationMinutes: z.number().int().positive().max(24 * 60).nullable().optional(),
  learningNotes: z.string().max(5000).optional(),
  rejectionReview: rejectionReviewSchema.optional(),
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
    const rejectionReview = outcome === "rejected" ? parsed.data.rejectionReview ?? EMPTY_REJECTION_REVIEW : null;
    const combinedFunderFeedback = [
      parsed.data.funderFeedback?.trim(),
      parsed.data.responseText?.trim() ? `Funder response text:\n${parsed.data.responseText.trim()}` : "",
      parsed.data.responseScreenshotDataUrl ? `Screenshot evidence uploaded: ${parsed.data.responseScreenshotName ?? "response screenshot"}` : "",
    ].filter(Boolean).join("\n\n");
    const actualApplicationMinutes = parsed.data.actualApplicationMinutes ?? null;
    const actualApplicationTimeNote = actualApplicationMinutes
      ? `Actual application time from starting the funder form to submission: ${formatApplicationDuration(actualApplicationMinutes)}.`
      : "";
    const learningNotesForInsight = [
      parsed.data.learningNotes?.trim(),
      actualApplicationTimeNote,
      rejectionReview ? rejectionReviewContext(rejectionReview) : "",
    ].filter(Boolean).join("\n\n");

    let insight: OutcomeLearningInsight;
    if (planAllowsForOrg(org, "outcome_learning_ai")) {
      // Missing setup is supported; unavailable source data is reported as a coverage limit.
      const context = await Promise.all([
        loadReviewedGrantDocuments(supabase, [application.grantId]),
        loadExpertAdviceContext(supabase, orgId, application.profileId, [application.grantId]),
      ]).then(([reviewed, expert]) => appendPublishedRequirements(expert, reviewed.documents) || "No published source review or completed expert report is available.").catch(() => "Source or expert reports could not be loaded. Do not infer their contents.");
      insight = await generateOutcomeLearningInsight({
        advisoryContext: context,
        outcome,
        grantName: String((grant as { name?: string } | null)?.name ?? "Grant"),
        funder: String((grant as { funder?: string } | null)?.funder ?? "Funder"),
        profileSummary: buildOutcomeProfileSummary((profile ?? {}) as Record<string, unknown>),
        funderFeedback: combinedFunderFeedback || parsed.data.funderFeedback,
        learningNotes: learningNotesForInsight || parsed.data.learningNotes,
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
            rejectionReview,
            actualApplicationMinutes,
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

    // A refresh failure must not turn a successful evidence save into an error.
    await requestEligibilityRefresh(orgId, "application.outcome.recorded").catch((error) => {
      console.error("[OUTCOME_REFRESH]", error);
    });
    revalidatePath(`/applications/${id}`);
    revalidatePath("/applications/outcomes");
    return NextResponse.json({ outcome: saved, insight });
  } catch (e) {
    console.error("[APPLICATION_OUTCOME]", e);
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
