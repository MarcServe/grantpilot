import assert from "node:assert/strict";
import { saveRecommendationFeedback } from "../lib/recommendation-feedback";
async function main() {
  let missingTable = true, failStatus = false;
  const states: Record<string, unknown>[] = [];
  const feedback: Record<string, unknown>[] = [];
  const db = { from(table: string) {
    if (table === "RecommendationFeedback") return { insert: async (row: Record<string, unknown>) => {
      if (missingTable) return { error: { message: "RecommendationFeedback is missing" } };
      feedback.push(row); return { error: null };
    } };
    return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: null, error: null }), upsert: async (row: Record<string, unknown>) => {
      if (failStatus) return { error: { message: "Status save failed" } };
      states.push(row); return { error: null };
    } };
  } };
  const input = { organisationId: "org", profileId: "profile", grantId: "grant", userId: "user", category: "already_applied" };
  const result = await saveRecommendationFeedback(db as never, input);
  assert.equal(result.grantState, "applied");
  assert.equal(result.feedbackStored, false);
  assert.equal(states[0].status, "applied");
  assert.equal(states[0].suppress_notifications, true);
  assert.equal(states[0].profile_id, "profile");
  missingTable = false;
  assert.equal((await saveRecommendationFeedback(db as never, input)).feedbackStored, true);
  assert.equal(feedback[0].category, "already_applied");
  failStatus = true;
  await assert.rejects(saveRecommendationFeedback(db as never, input), /Status save failed/);
  missingTable = true;
  await assert.rejects(saveRecommendationFeedback(db as never, { ...input, category: "relevant" }), /missing/);
  console.log("Already-applied status and feedback failure checks passed");
}
void main();
