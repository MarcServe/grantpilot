export interface QuestionIdentity {
  questionId: string;
  question: string;
}

/** Never attach an answer to a question by array position or by a model's title. */
export function orderQuestionAnswerRows(raw: unknown, questions: QuestionIdentity[]): Record<string, unknown>[] {
  const data = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  if (!Array.isArray(data.answers) || data.answers.length !== questions.length) {
    throw new Error("The response did not include one answer for every question.");
  }
  const byId = new Map<string, Record<string, unknown>>();
  for (const item of data.answers) {
    if (!item || typeof item !== "object") throw new Error("An answer was invalid.");
    const row = item as Record<string, unknown>;
    const expected = questions.find((question) => question.questionId === row.questionId);
    if (!expected || byId.has(expected.questionId) || row.question !== expected.question ||
      typeof row.draftAnswer !== "string" || !row.draftAnswer.trim()) {
      throw new Error("An answer could not be matched to its original question.");
    }
    byId.set(expected.questionId, row);
  }
  return questions.map((question) => byId.get(question.questionId)!);
}
