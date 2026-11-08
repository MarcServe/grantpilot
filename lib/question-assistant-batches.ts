import { orderQuestionAnswerRows, type QuestionIdentity } from "@/lib/question-answer-contract";
import { QUESTION_BATCH_SIZE } from "@/lib/validations/question-assistant";

export type QuestionProgress = { status: "waiting" | "generating" | "complete" | "error"; error?: string };
export class QuestionBatchError extends Error {
  constructor(message: string, public stop = false) { super(message); }
}

/** Retain successes, make failures explicit, and never silently drop a question. */
export async function runQuestionAnswerBatches<T extends QuestionIdentity>(
  questions: T[],
  generate: (batch: T[]) => Promise<unknown>,
  onProgress: (questionId: string, progress: QuestionProgress) => void,
  onAnswers: (rows: Record<string, unknown>[]) => void,
): Promise<{ completed: number; failed: number }> {
  let completed = 0;
  let failed = 0;
  for (let offset = 0; offset < questions.length; offset += QUESTION_BATCH_SIZE) {
    const batch = questions.slice(offset, offset + QUESTION_BATCH_SIZE);
    batch.forEach((question) => onProgress(question.questionId, { status: "generating" }));
    try {
      const rows = orderQuestionAnswerRows(await generate(batch), batch);
      onAnswers(rows);
      completed += rows.length;
      batch.forEach((question) => onProgress(question.questionId, { status: "complete" }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not generate this answer. Try again.";
      const stopped = error instanceof QuestionBatchError && error.stop;
      const affected = stopped ? questions.slice(offset) : batch;
      failed += affected.length;
      affected.forEach((question) => onProgress(question.questionId, { status: "error", error: message }));
      if (stopped) break;
    }
  }
  return { completed, failed };
}
