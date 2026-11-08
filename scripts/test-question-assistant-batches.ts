import assert from "node:assert/strict";
import { parseQuestionBlocks, questionAssistantRequestSchema } from "../lib/validations/question-assistant";
import { orderQuestionAnswerRows } from "../lib/question-answer-contract";
import { QuestionBatchError, runQuestionAnswerBatches, type QuestionProgress } from "../lib/question-assistant-batches";
import { generateFounderPackQuestionAnswers } from "../lib/founder-pack";

const headings = [
  "Subsidy basis", "Application team", "Research category", "Project summary", "Public description", "Scope",
  "1. Themes (not scored)", "2. Applicant location (not scored)", "3. Animal testing (not scored)",
  "4. Permits and licences (not scored)", "5. International collaboration (not scored)", "6. Export licence (not scored)",
  "7. Trusted Research and Innovation (not scored)", "8. Intellectual property (IP) position, freedom to operate\nand defensibility",
  "9. Need, technical development, validation and outputs", "10. Team and resources", "11. Market awareness",
  "12. Outcomes and route to market", "13. Wider impacts", "14. Project management", "15. Risks", "16. Added value",
  "17. Costs and value for money", "Your project finances", "Finances overview", "Project impact",
];
assert.deepEqual(parseQuestionBlocks(headings.join("\r\n")), headings);
assert.deepEqual(parseQuestionBlocks("1. Describe the project\nYour answer should cover the objectives.\n2. Explain the risks\nInclude the mitigation plan."), [
  "1. Describe the project\nYour answer should cover the objectives.", "2. Explain the risks\nInclude the mitigation plan.",
]);
assert.deepEqual(parseQuestionBlocks("Choose one of the following options:\n1. AI\n2. Health\nExplain why you chose this option."), ["Choose one of the following options:\n1. AI\n2. Health\nExplain why you chose this option."]);
assert.deepEqual(parseQuestionBlocks("Describe your project.\n\nYour answer should explain the aims.\nInclude the team."), ["Describe your project.\n\nYour answer should explain the aims.\nInclude the team."]);
assert.deepEqual(parseQuestionBlocks("Project summary\nScope", "paragraphs"), ["Project summary\nScope"]);
assert.deepEqual(parseQuestionBlocks("Project summary\nDescribe the project and its aims.\nTeam and resources\nExplain who will deliver the project."), ["Project summary\nDescribe the project and its aims.", "Team and resources\nExplain who will deliver the project."]);
assert.equal(questionAssistantRequestSchema.safeParse({ profileId: "p1", questions: [{ question: "IP" }] }).success, true);
assert.equal(questionAssistantRequestSchema.safeParse({ profileId: "p1", questions: [{ questionId: "q1", question: "Risks" }, { questionId: "q1", question: "Scope" }] }).success, false);

const questions = headings.map((question, index) => ({ questionId: `q${index + 1}`, question }));
const rowsFor = (batch: typeof questions) => batch.map((question) => ({ ...question, draftAnswer: `Specific draft for ${question.question}`, confidence: "low", evidenceStrength: "weak", rationale: "", missingEvidence: [], suggestedProfileUpdates: [], warnings: [] }));
const first = rowsFor(questions.slice(0, 2));
assert.deepEqual(orderQuestionAnswerRows({ answers: [...first].reverse() }, questions.slice(0, 2)), first);
for (const answers of [first.slice(0, 1), [first[0], first[0]], [first[0], { ...first[1], questionId: "unexpected" }], [first[0], { ...first[1], question: "Different question" }], [first[0], { ...first[1], draftAnswer: " " }]]) {
  assert.throws(() => orderQuestionAnswerRows({ answers }, questions.slice(0, 2)));
}

async function main() {
  const progress: Record<string, QuestionProgress> = {};
  const completed: Record<string, unknown>[] = [];
  let calls = 0;
  const result = await runQuestionAnswerBatches(questions, async (batch) => {
    calls++;
    assert.ok(batch.length <= 2);
    if (batch[0].questionId === "q3") throw new Error("Temporary model timeout");
    return { answers: rowsFor(batch).reverse() };
  }, (id, state) => { progress[id] = state; }, (rows) => completed.push(...rows));
  assert.equal(calls, 13);
  assert.deepEqual(result, { completed: 24, failed: 2 });
  assert.equal(completed.length, 24);
  assert.equal(progress.q3.status, "error");
  assert.equal(progress.q26.status, "complete");
  const retryQuestions = questions.filter((question) => progress[question.questionId].status === "error");
  const retried = await runQuestionAnswerBatches(retryQuestions, async (batch) => ({ answers: rowsFor(batch) }), (id, state) => { progress[id] = state; }, (rows) => completed.push(...rows));
  assert.deepEqual(retried, { completed: 2, failed: 0 });
  assert.equal(new Set(completed.map((row) => row.questionId)).size, 26);
  let stoppedCalls = 0;
  const stopped = await runQuestionAnswerBatches(questions, async () => {
    stoppedCalls++; throw new QuestionBatchError("Please sign in again", true);
  }, () => {}, () => assert.fail("No successful answer expected"));
  assert.equal(stoppedCalls, 1);
  assert.deepEqual(stopped, { completed: 0, failed: 26 });

  // Exercise the actual server generator, including bounded groups and a malformed model retry.
  let modelCalls = 0;
  const generated = await generateFounderPackQuestionAnswers({ businessName: "Test business" }, {
    questions: questions.slice(0, 5).map((question) => ({ ...question, wordLimit: 1500 })),
  }, "Synthetic funder context", async (prompt, maxTokens) => {
    modelCalls++;
    assert.match(prompt, /comprehensive answer/);
    assert.match(prompt, /Never claim compliance/);
    const matches = [...prompt.matchAll(/Question ID: (q\d+)\nOriginal question \(copy exactly\): (.+)\nWord limit/g)];
    assert.ok(matches.length <= 2);
    assert.ok((maxTokens ?? 0) >= matches.length * 4500, "Token budget scales with each full-length answer");
    if (modelCalls === 1) return JSON.stringify({ answers: [{ questionId: "wrong", question: "wrong", draftAnswer: "Wrong" }] });
    return JSON.stringify({ answers: rowsFor(matches.map((match) => ({ questionId: match[1], question: match[2] }))).reverse() });
  });
  assert.equal(modelCalls, 4, "Three groups plus a retry");
  assert.deepEqual(generated.answers.map((answer) => answer.question), headings.slice(0, 5));
  console.log("Question detection, 26-question batching, identity mapping, partial recovery and server generation checks passed");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
