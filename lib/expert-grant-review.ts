import { z } from "zod";
const publicReference = z.string().url().max(2000).refine(value => /^https?:\/\//i.test(value), "Use an http or https reference link.");
export const expertAdviceSchema = z.object({
  status: z.enum(["in_review", "completed"]),
  reviewerName: z.string().trim().min(2).max(160),
  reviewerExpertise: z.string().trim().min(20).max(2000),
  trackRecordReferences: z.array(publicReference).min(1).max(5),
  verifiedTrackRecord: z.literal(true),
  advice: z.string().trim().max(15000),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
}).superRefine((value, ctx) => {
  if (value.status === "completed" && value.advice.length < 100) ctx.addIssue({ code: "custom", path: ["advice"], message: "Record the expert's substantive advice before publishing (at least 100 characters)." });
});
export interface ExpertGrantReview {
  id: string;
  applicationId: string;
  status: "requested" | "in_review" | "completed";
  reviewerName: string | null;
  reviewerExpertise: string | null;
  trackRecordReferences: string[];
  advice: string | null;
  requestedAt: string;
  updatedAt: string;
  reviewedAt: string | null;
}
// Unpublished advice stays private to the admin queue.
export function applicantReviewView(review: ExpertGrantReview) {
  return { ...review, advice: review.status === "completed" ? review.advice : null };
}
export const EXPERT_REVIEW_COLUMNS = "id,applicationId,status,reviewerName,reviewerExpertise,trackRecordReferences,advice,requestedAt,updatedAt,reviewedAt";
