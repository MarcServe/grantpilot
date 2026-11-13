import assert from "node:assert/strict";
import { EMPTY_REJECTION_REVIEW, readRejectionReview, rejectionReviewSchema, rejectionActions, rejectionReviewContext } from "../lib/rejection-review";

assert.deepEqual(readRejectionReview("legacy notes"), EMPTY_REJECTION_REVIEW);
assert.deepEqual(readRejectionReview('{"rejectionReview":{"reason":"invented"}}'), EMPTY_REJECTION_REVIEW);
assert.equal(rejectionReviewSchema.safeParse({ reason: "evidence", source: "unknown", completedActions: [] }).success, false);
assert.equal(rejectionReviewSchema.safeParse({ reason: "evidence", source: "applicant", completedActions: ["invented"] }).success, false);
const review = rejectionReviewSchema.parse({ reason: "evidence", source: "applicant", completedActions: ["strengthen_evidence"] });
assert.deepEqual(readRejectionReview(JSON.stringify({ userNotes: "Preserved separately", rejectionReview: review })), review);
assert.match(rejectionReviewContext(review), /not confirmed by the funder/);
assert.match(rejectionReviewContext(review), /\[completed\].*missing validation/);
assert.match(rejectionReviewContext(review), /self-reported, not verified/);
assert.equal(rejectionActions(review).length, 3);
assert.match(rejectionActions({ ...review, reason: "competition" })[1].label, /does not establish ineligibility/);
assert.match(rejectionReviewContext(EMPTY_REJECTION_REVIEW), /no reason established/);
assert.match(rejectionReviewContext({ ...review, source: "funder" }), /Applicant reports/);
console.log("Rejection review validation, provenance, legacy records and progress checks passed.");
