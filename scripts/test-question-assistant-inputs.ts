import assert from "node:assert/strict";
import { parseQuestionBlocks, questionAssistantRequestSchema } from "../lib/validations/question-assistant";

const pasted = `Focus area guidance\n\n1. AI infrastructure\n2. Public services\n\nExplain how your company aligns with the selected focus area. ${"Evidence and project guidance. ".repeat(110)}`;
assert.ok(pasted.length > 2000);
assert.deepEqual(parseQuestionBlocks(pasted), [pasted.trim()]);
const input = { profileId: "profile-1", questions: [{ question: pasted }], outputMode: "draft_answer" };
assert.equal(questionAssistantRequestSchema.safeParse(input).success, true, "Long multi-paragraph funder guidance must be accepted as one question");
assert.deepEqual(parseQuestionBlocks("First question?\n---\nSecond question?"), ["First question?", "Second question?"]);
assert.deepEqual(parseQuestionBlocks("1. First option\n2. Second option\nExplain the option you selected."), ["1. First option\n2. Second option\nExplain the option you selected."]);
assert.equal(parseQuestionBlocks(Array.from({length: 9}, (_, i) => `Question ${i}?`).join("\n---\n")).length, 9, "Do not silently truncate questions");
for (const wordLimit of [0, 29, 1501, 1.5, NaN]) {
  const result = questionAssistantRequestSchema.safeParse({ ...input, questions: [{ question: "Describe your project", wordLimit }] });
  assert.equal(result.success, false);
}
assert.equal(questionAssistantRequestSchema.safeParse({ ...input, questions: [{ question: "x".repeat(12001) }] }).success, false);
assert.equal(questionAssistantRequestSchema.safeParse({ ...input, outputMode: "improve_existing_answer" }).success, false);
assert.equal(questionAssistantRequestSchema.safeParse({ ...input, outputMode: "improve_existing_answer", existingAnswer: "Our project delivers a local pilot." }).success, true);
const tooManyGrants = questionAssistantRequestSchema.safeParse({ ...input, selectedEligibleGrantIds: Array.from({ length: 6 }, (_, i) => `g${i}`) });
assert.equal(tooManyGrants.success, false);
if (!tooManyGrants.success) assert.match(tooManyGrants.error.issues[0].message, /at most 5 grants/);
assert.equal(questionAssistantRequestSchema.safeParse({ ...input, questions: Array.from({ length: 5 }, () => ({ question: "x".repeat(12000) })) }).success, false);
console.log("Question assistant input checks passed");
