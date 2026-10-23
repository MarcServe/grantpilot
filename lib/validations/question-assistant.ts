import { z } from "zod";

export const QUESTION_MAX_CHARS = 12_000;
export const questionAssistantRequestSchema = z.object({
  profileId: z.string().min(1, "Choose a business profile first."),
  applicationId: z.string().min(1).optional(),
  eligibleGrantId: z.string().min(1).optional(),
  selectedApplicationIds: z.array(z.string().min(1)).max(5, "Select at most 5 applications as context.").optional(),
  selectedEligibleGrantIds: z.array(z.string().min(1)).max(5, "Select at most 5 grants as context.").optional(),
  pastedGrantContext: z.string().max(8000, "Grant context must be 8,000 characters or fewer.").optional(),
  questions: z.array(z.object({
    question: z.string().trim().min(5, "Enter a question of at least 5 characters.").max(QUESTION_MAX_CHARS, "Each question, including its guidance, must be 12,000 characters or fewer."),
    wordLimit: z.number().int("Word limit must be a whole number.").min(30, "Word limit must be at least 30.").max(1500, "Word limit must be 1,500 or fewer.").optional(),
    guidance: z.string().max(10_000, "Extra guidance must be 10,000 characters or fewer.").optional(),
  })).min(1, "Paste at least one question.").max(8, "Generate at most 8 questions at a time."),
  outputMode: z.enum(["draft_answer", "evidence_check", "improve_existing_answer"]).optional(),
  existingAnswer: z.string().max(12_000, "Your existing answer must be 12,000 characters or fewer.").optional(),
}).superRefine((data, ctx) => {
  if (data.questions.reduce((total, question) => total + question.question.length + (question.guidance?.length ?? 0), 0) > 48_000) {
    ctx.addIssue({ code: "custom", path: ["questions"], message: "Combined questions and guidance must be 48,000 characters or fewer." });
  }
  if (data.outputMode === "improve_existing_answer" && !data.existingAnswer?.trim()) {
    ctx.addIssue({ code: "custom", path: ["existingAnswer"], message: "Paste your existing answer to use Improve existing answer." });
  }
});

// A pasted question often contains paragraphs and numbered answer options.
// Only an explicit separator creates another question; never truncate silently.
export function parseQuestionBlocks(value: string): string[] {
  return value.trim().split(/^\s*---\s*$/m).map((item) => item.trim()).filter(Boolean);
}
