import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getEligibilityDecision, getConfidenceBand } from "@/lib/claude";
import type { EligibilityResult } from "@/lib/claude";
import { getApplicantTypeGate } from "@/lib/eligibility-hard-gates";
import { applyEligibilityScoreGuards } from "@/lib/eligibility-score-guards";
import { checkUsageLimit, recordUsage } from "@/lib/plan-check";
import { isFreeTrialActive, resolvePlanKey } from "@/lib/plan-features";
import { getGrantFreshnessStatus } from "@/lib/grant-freshness";
import {
  applyOutcomeScoreAdjustment,
  buildFundingOutcomeSignals,
  deriveOutcomeLearningAdvisory,
} from "@/lib/outcome-learning";

function profileToMatching(profile: Record<string, unknown>) {
  const get = (key: string) => profile[key] ?? profile[key.replace(/([A-Z])/g, "_$1").toLowerCase()];
  return {
    businessName: String(get("businessName") ?? ""),
    sector: String(get("sector") ?? ""),
    missionStatement: String(get("missionStatement") ?? ""),
    description: String(get("description") ?? ""),
    location: String(get("location") ?? ""),
    employeeCount: profile.employeeCount != null ? Number(profile.employeeCount) : (profile.employee_count != null ? Number(profile.employee_count) : null),
    annualRevenue: profile.annualRevenue != null ? Number(profile.annualRevenue) : (profile.annual_revenue != null ? Number(profile.annual_revenue) : null),
    yearEstablished: profile.yearEstablished != null ? Number(profile.yearEstablished) : (profile.year_established != null ? Number(profile.year_established) : null),
    fundingMin: Number(get("fundingMin") ?? get("funding_min") ?? 0),
    fundingMax: Number(get("fundingMax") ?? get("funding_max") ?? 0),
    fundingPurposes: Array.isArray(profile.fundingPurposes) ? profile.fundingPurposes as string[] : (Array.isArray(profile.funding_purposes) ? profile.funding_purposes as string[] : []),
    fundingDetails: profile.fundingDetails != null ? String(profile.fundingDetails) : (profile.funding_details != null ? String(profile.funding_details) : null),
    businessType: String(get("businessType") ?? get("business_type") ?? ""),
    fundingOutcomeSignals: profile.fundingOutcomeSignals != null ? String(profile.fundingOutcomeSignals) : null,
  };
}

function closedEligibilityPayload(message: string, scoringSource: "openai" | "heuristic" | "embedding" | "intelligence" | "manual" = "manual") {
  return {
    decision: "unlikely" as const,
    reason: message,
    confidence: 0,
    score: 0,
    summary: message,
    reasons: [message],
    alignment: [],
    improvementPlan: {
      gaps: ["Opportunity appears closed or temporally stale"],
      actions: ["Do not apply through this listing unless the funder confirms the programme is still open."],
      timeline: "Before applying",
    },
    met: [],
    missing: ["Opportunity appears closed or temporally stale"],
    confidenceBand: getConfidenceBand(0),
    winProbability: 0,
    evidenceStrength: "weak" as const,
    scoringSource,
  };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { org, orgId } = await getActiveOrg();
    const profile = org.profiles?.[0];
    if (!profile || (profile.completionScore ?? 0) < 50) {
      return NextResponse.json(
        { error: "Complete at least 50% of your profile to get eligibility assessment." },
        { status: 400 }
      );
    }

    const { id: grantId } = await params;
    const url = new URL(req.url);
    const useCache = url.searchParams.get("skipCache") !== "true";
    const supabase = getSupabaseAdmin();

    const { data: grant, error: grantError } = await supabase
      .from("Grant")
      .select("id, name, funder, amount, deadline, url_status, eligibility, description, objectives, applicantTypes, sectors, regions")
      .eq("id", grantId)
      .single();

    if (grantError || !grant) {
      return NextResponse.json({ error: "Grant not found" }, { status: 404 });
    }

    const g = grant as {
      id: string;
      name: string;
      funder: string;
      amount: number | null;
      deadline?: string | null;
      url_status?: string | null;
      eligibility: string;
      description?: string;
      objectives?: string;
      applicantTypes?: string[];
      sectors: string[];
      regions: string[];
    };
    const freshness = getGrantFreshnessStatus(g);
    if (!freshness.usable) {
      return NextResponse.json(closedEligibilityPayload(freshness.message ?? "This opportunity appears closed or stale."));
    }

    const { data: outcomeRows } = await supabase
      .from("ApplicationOutcome")
      .select("outcome, awardedAmount, funderFeedback, learningNotes, Grant(name, funder)")
      .eq("organisationId", orgId)
      .eq("profileId", profile.id)
      .order("reportedAt", { ascending: false })
      .limit(8);

    if (useCache) {
      const { data: cached } = await supabase
        .from("EligibilityAssessment")
        .select("score, decision, summary, reasons, alignment, improvement_plan, met_criteria, missing_criteria, scoring_source")
        .eq("organisation_id", orgId)
        .eq("profile_id", profile.id)
        .eq("grant_id", grantId)
        .maybeSingle();
      if (cached) {
        const c = cached as {
          score: number;
          decision: string;
          summary: string | null;
          reasons: unknown;
          alignment: unknown;
          improvement_plan: unknown;
          met_criteria: unknown;
          missing_criteria: unknown;
          scoring_source?: string | null;
        };
        const scoringSource = c.scoring_source ?? (c.summary?.startsWith("Preliminary fit") ? "heuristic" : "openai");
        const score = scoringSource === "heuristic" ? Math.min(c.score, 69) : c.score;
        const applicantGate = getApplicantTypeGate(
          String((profile as Record<string, unknown>).businessType ?? (profile as Record<string, unknown>).business_type ?? ""),
          g
        );
        if (applicantGate && !applicantGate.profileMatches) {
          const gatedScore = Math.min(score, 25);
          return NextResponse.json({
            decision: "unlikely",
            reason: `This grant appears restricted by applicant type. ${applicantGate.reason}, but your profile is not marked as one of those organisation types.`,
            confidence: gatedScore,
            score: gatedScore,
            summary: `Unlikely eligible: ${applicantGate.reason}, which does not match your business type.`,
            reasons: [`Applicant type mismatch: ${applicantGate.reason}`],
            alignment: [],
            improvementPlan: {
              gaps: [applicantGate.reason],
              actions: ["Only apply if your organisation is registered under one of the required applicant types."],
              timeline: "Before applying",
            },
            met: [],
            missing: [applicantGate.reason],
            confidenceBand: getConfidenceBand(gatedScore),
            winProbability: gatedScore,
            evidenceStrength: "weak",
            scoringSource,
          });
        }
        const profileMatch = profileToMatching(profile as Record<string, unknown>);
        const cachedResult = applyOutcomeScoreAdjustment(applyEligibilityScoreGuards(
          profileMatch,
          g,
          {
            decision: c.decision === "likely_eligible" || c.decision === "review" || c.decision === "unlikely" ? c.decision : "review",
            reason: c.summary ?? "",
            confidence: score,
            score,
            summary: c.summary ?? undefined,
            reasons: (c.reasons as string[]) ?? [],
            alignment: (c.alignment as string[]) ?? undefined,
            improvementPlan: c.improvement_plan as EligibilityResult["improvementPlan"],
            met: (c.met_criteria as string[]) ?? [],
            missing: (c.missing_criteria as string[]) ?? [],
            winProbability: score,
            evidenceStrength: score >= 80 ? "strong" : score >= 55 ? "medium" : "weak",
          }
        ), deriveOutcomeLearningAdvisory(outcomeRows ?? []));
        const cachedScore = cachedResult.score ?? cachedResult.confidence;
        return NextResponse.json({
          ...cachedResult,
          confidenceBand: getConfidenceBand(cachedScore),
          scoringSource,
        });
      }
    }

    const plan = resolvePlanKey((org as { plan?: string }).plan);
    const { allowed, remaining } = await checkUsageLimit(orgId, "match");
    if (!allowed) {
      const trialExpired =
        plan === "FREE_TRIAL" &&
        !isFreeTrialActive(org as { plan?: string; createdAt?: string | Date | null });
      const message =
        trialExpired
          ? "Your 7-day free trial has expired. Upgrade to continue full company-DNA eligibility checks."
          : plan === "FREE_TRIAL"
          ? "You've used all free-trial full eligibility checks. Cached scores still appear for grants you've already assessed. Upgrade to continue company-DNA scoring."
          : "Monthly eligibility check quota reached.";
      return NextResponse.json({ error: message, code: "MATCH_LIMIT", remaining }, { status: 402 });
    }

    const result = await getEligibilityDecision(
      profileToMatching({
        ...(profile as Record<string, unknown>),
        fundingOutcomeSignals: buildFundingOutcomeSignals(outcomeRows ?? []),
      }),
      {
        id: g.id,
        name: g.name,
        funder: g.funder,
        amount: g.amount,
        eligibility: g.eligibility,
        description: g.description ?? null,
        objectives: g.objectives ?? null,
        applicantTypes: g.applicantTypes ?? [],
        sectors: g.sectors ?? [],
        regions: g.regions ?? [],
      }
    );
    const adjustedResult = applyOutcomeScoreAdjustment(result, deriveOutcomeLearningAdvisory(outcomeRows ?? []));

    const score = adjustedResult.score ?? adjustedResult.confidence;
    await supabase.from("EligibilityAssessment").upsert(
      {
        organisation_id: orgId,
        profile_id: profile.id,
        grant_id: grantId,
        score,
        decision: adjustedResult.decision,
        summary: adjustedResult.summary ?? adjustedResult.reason,
        reasons: adjustedResult.reasons ?? [],
        alignment: adjustedResult.alignment ?? null,
        improvement_plan: adjustedResult.improvementPlan ?? null,
        met_criteria: adjustedResult.met ?? [],
        missing_criteria: adjustedResult.missing ?? [],
        scoring_source: "openai",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organisation_id,profile_id,grant_id" }
    );

    await recordUsage(orgId, "match");

    return NextResponse.json({
      ...adjustedResult,
      confidenceBand: getConfidenceBand(score),
      scoringSource: "openai",
    });
  } catch (e) {
    console.error("[GRANTS_ELIGIBILITY]", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
