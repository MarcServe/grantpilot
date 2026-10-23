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

assert.equal(questionAssistantRequestSchema.safeParse({ ...input, questions: [{ question: "Describe the project", guidance: "x".repeat(10_000) }] }).success, true);
const oversizedGuidance = questionAssistantRequestSchema.safeParse({ ...input, questions: [{ question: "Describe the project", guidance: "x".repeat(10_001) }] });
assert.equal(oversizedGuidance.success, false);
if (!oversizedGuidance.success) assert.match(oversizedGuidance.error.issues[0].message, /10,000/);

const formQuestions = ["Estimated total project cost (£)", "Grant amount you're seeking (£)", "If the grant doesn't cover the full cost, where will the rest come from?", "Indicative project start date", "Why is public funding needed?", "Why wouldn't this asset get built without grant support?"];
assert.deepEqual(parseQuestionBlocks(formQuestions.join("\n"), "lines"), formQuestions);
assert.deepEqual(parseQuestionBlocks("First question?\r\n\r\nSecond question?", "lines"), ["First question?", "Second question?"]);
assert.deepEqual(parseQuestionBlocks("Question with guidance\ncontinued paragraph\n---\nNext question?", "lines"), ["Question with guidance\ncontinued paragraph", "Next question?"]);
