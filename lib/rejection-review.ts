import { z } from "zod";

export const REJECTION_REASONS = {
  unknown: "No reason provided yet",
  eligibility: "Eligibility or project scope",
  evidence: "Insufficient evidence or validation",
  innovation: "Innovation or technical approach",
  finances: "Budget, co-funding or value for money",
  delivery: "Team, delivery plan or risks",
  competition: "Competitive ranking or limited funding",
} as const;

export const rejectionReviewSchema = z.object({
  reason: z.enum(["unknown", "eligibility", "evidence", "innovation", "finances", "delivery", "competition"]),
  source: z.enum(["unknown", "funder", "applicant"]),
  completedActions: z.array(z.enum(["request_feedback", "review_scope", "strengthen_evidence", "explain_novelty", "review_budget", "review_delivery", "review_ranking", "prepare_next"])).max(8),
}).superRefine((value, ctx) => {
  if (value.source === "unknown" && value.reason !== "unknown") {
    ctx.addIssue({ code: "custom", path: ["source"], message: "Choose whether the reason came from the funder or your own review." });
  }
});
export type RejectionReview = z.infer<typeof rejectionReviewSchema>;
export const EMPTY_REJECTION_REVIEW: RejectionReview = { reason: "unknown", source: "unknown", completedActions: [] };

export function readRejectionReview(notes?: string | null): RejectionReview {
  try {
    const parsed = rejectionReviewSchema.safeParse(JSON.parse(notes ?? "{}").rejectionReview);
    return parsed.success ? parsed.data : { ...EMPTY_REJECTION_REVIEW, completedActions: [] };
  } catch {
    return { ...EMPTY_REJECTION_REVIEW, completedActions: [] };
  }
}

export function rejectionActions(review: RejectionReview) {
  const actions = [{ id: "request_feedback", label: "Request or review the funder's decision, reviewer scores and resubmission rules.", href: "#funderFeedback" }];
  const specific = {
    eligibility: { id: "review_scope", label: "Compare project scope and mandatory conditions with your confirmed Business DNA.", href: "/profile" },
    evidence: { id: "strengthen_evidence", label: "Gather the missing validation, benchmarks or supporting evidence identified in feedback.", href: "/data-vault" },
    innovation: { id: "explain_novelty", label: "Explain technical novelty, baselines and defensibility using evidence you can support.", href: "/grant-assistant" },
    finances: { id: "review_budget", label: "Recheck eligible costs, funding rates, co-funding and value for money.", href: "/profile" },
    delivery: { id: "review_delivery", label: "Revise milestones, team responsibilities and mitigations for delivery risks.", href: "/grant-assistant" },
    competition: { id: "review_ranking", label: "Review assessor scores before changing your project: limited funding does not establish ineligibility.", href: "#responseText" },
    unknown: { id: "review_scope", label: "Review the official requirements; keep the rejection cause unconfirmed until evidence is available.", href: "/grants/eligible" },
  }[review.reason];
  return [...actions, specific, { id: "prepare_next", label: "Use the recorded feedback to improve the next grant-specific draft and review it before submission.", href: "/grant-assistant" }];
}

export function rejectionReviewContext(review: RejectionReview): string {
  const source = { unknown: "Unconfirmed; no reason established", funder: "Applicant reports this reason was provided by the funder", applicant: "Applicant's own interpretation; not confirmed by the funder" }[review.source];
  return `Rejection review: ${REJECTION_REASONS[review.reason]}. Source: ${source}.\nImprovement checklist (completion is self-reported, not verified evidence):\n${rejectionActions(review).map(a => `- [${review.completedActions.includes(a.id as RejectionReview["completedActions"][number]) ? "completed" : "pending"}] ${a.label}`).join("\n")}`;
}
