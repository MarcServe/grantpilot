import { z } from "zod";

export const QUESTION_MAX_CHARS = 12_000;
export const QUESTION_BATCH_SIZE = 2;
export type QuestionLayout = "auto" | "paragraphs" | "lines";
export const questionAssistantRequestSchema = z.object({
  profileId: z.string().min(1, "Choose a business profile first."),
  applicationId: z.string().min(1).optional(),
  eligibleGrantId: z.string().min(1).optional(),
  selectedApplicationIds: z.array(z.string().min(1)).max(5, "Select at most 5 applications as context.").optional(),
  selectedEligibleGrantIds: z.array(z.string().min(1)).max(5, "Select at most 5 grants as context.").optional(),
  pastedGrantContext: z.string().max(8000, "Grant context must be 8,000 characters or fewer.").optional(),
  questions: z.array(z.object({
    questionId: z.string().trim().min(1).max(80).optional(),
    question: z.string().trim().min(2, "Enter a question or section heading of at least 2 characters.").max(QUESTION_MAX_CHARS, "Each question, including its guidance, must be 12,000 characters or fewer."),
    wordLimit: z.number().int("Word limit must be a whole number.").min(30, "Word limit must be at least 30.").max(1500, "Word limit must be 1,500 or fewer.").optional(),
    guidance: z.string().max(10_000, "Extra guidance must be 10,000 characters or fewer.").optional(),
  })).min(1, "Paste at least one question.").max(8, "Generate at most 8 questions at a time."),
  outputMode: z.enum(["draft_answer", "evidence_check", "improve_existing_answer"]).optional(),
  existingAnswer: z.string().max(12_000, "Your existing answer must be 12,000 characters or fewer.").optional(),
}).superRefine((data, ctx) => {
  const ids = data.questions.flatMap((question) => question.questionId ? [question.questionId] : []);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: "custom", path: ["questions"], message: "Each question must have a unique identifier." });
  }
  if (data.questions.reduce((total, question) => total + question.question.length + (question.guidance?.length ?? 0), 0) > 48_000) {
    ctx.addIssue({ code: "custom", path: ["questions"], message: "Combined questions and guidance must be 48,000 characters or fewer." });
  }
  if (data.outputMode === "improve_existing_answer" && !data.existingAnswer?.trim()) {
    ctx.addIssue({ code: "custom", path: ["existingAnswer"], message: "Paste your existing answer to use Improve existing answer." });
  }
});

export type QuestionAssistantRequest = z.infer<typeof questionAssistantRequestSchema>;

// Explicit separators always win. Auto mode recognises form headings and numbered
// questions while retaining wrapped lines, instructions and answer options.
const numberedHeading = /^(?:(?:question|q)\s*)?\d{1,3}[.):\]-]\s*\S|^question\s+\d+\s+/i;
const questionStart = /^(?:what|why|how|when|where|who|which|describe|explain|outline|provide|summarise|summarize|identify|detail|demonstrate|list|state|give|tell|estimate|confirm|does|do|is|are|will|can|have|has|if)\b/i;
const guidanceStart = /^(?:and|or|including|such as|for example|e\.g\.|your answer|you should|you must|please include|include the|in your|maximum|minimum|word limit|character limit|up to \d|no more than|you can|you may)\b/i;

function isShortHeading(line: string): boolean {
  return line.length <= 160 && line.split(/\s+/).length <= 22 &&
    /^[A-Z\d]/.test(line) && !/[.!:;]$/.test(line) && !guidanceStart.test(line);
}

export function parseQuestionBlocks(value: string, layout: QuestionLayout = "auto"): string[] {
  const text = value.replace(/\r\n?/g, "\n").trim();
  if (!text) return [];
  if (/^\s*---+\s*$/m.test(text)) {
    return text.split(/^\s*---+\s*$/m).map((item) => item.trim()).filter(Boolean);
  }
  if (layout === "paragraphs") return [text];
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  if (layout === "lines") return lines;

  // Numbered choices inside one prompt are not independent questions.
  const explicitQuestionNumbers = lines.some((line) => /^(?:question|q)\s*\d/i.test(line));
  const hasChoices = /\b(?:choose|select|tick)\b[^.?!\n]{0,90}\b(?:option|following|focus area|theme|one|all)\b|\b(?:option|focus area|theme) (?:you (?:have )?selected|selected)|\bselected (?:option|focus area|theme)\b/i.test(text);
  if (hasChoices && !explicitQuestionNumbers) return [text];

  const numberedCount = lines.filter((line) => numberedHeading.test(line)).length;
  const blocks: string[] = [];
  for (const line of lines) {
    const isNumbered = numberedCount >= 2 && numberedHeading.test(line);
    const isPrompt = !guidanceStart.test(line) && (questionStart.test(line) || /\?$/.test(line));
    const isHeading = isShortHeading(line);
    const previous = blocks[blocks.length - 1] ?? "";
    const previousTitle = previous.replace(/^(?:(?:question|q)\s*)?\d{1,3}[.):\]-]\s*/i, "");
    const expandsHeading = !isNumbered && !previous.includes("\n") && isShortHeading(previousTitle) &&
      !questionStart.test(previousTitle) && /^(?:describe|explain|outline|provide|summarise|summarize|detail|demonstrate)\b/i.test(line);
    if (expandsHeading) blocks[blocks.length - 1] += `\n${line}`;
    else if (!blocks.length || isNumbered || isPrompt || isHeading) blocks.push(line);
    else blocks[blocks.length - 1] += `\n${line}`;
  }
  // Long prose with a short introductory heading is one prompt, not a list.
  if (numberedCount < 2 && blocks.length < 2) return [text];
  return blocks;
}
