"use client";

import { parseQuestionBlocks, type QuestionLayout } from "@/lib/validations/question-assistant";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export function QuestionReview({ text, layout, disabled, onTextChange, onLayoutChange }: {
  text: string;
  layout: QuestionLayout;
  disabled: boolean;
  onTextChange: (text: string) => void;
  onLayoutChange: (layout: QuestionLayout) => void;
}) {
  const questions = parseQuestionBlocks(text, layout);
  function replace(next: string[]) {
    // Explicit blocks preserve manual edits instead of running detection again.
    onTextChange(next.join("\n\n---\n\n"));
    onLayoutChange("paragraphs");
  }
  return <div className="min-w-0 space-y-3">
    <Label htmlFor="questionLayout">Question detection</Label>
    <select id="questionLayout" disabled={disabled} value={layout}
      onChange={(event) => onLayoutChange(event.target.value as QuestionLayout)}
      className="h-10 w-full min-w-0 rounded-md border bg-white px-3 text-sm">
      <option value="auto">Automatic — headings and numbered questions</option>
      <option value="lines">One question per line</option>
      <option value="paragraphs">Keep paragraphs together — separate with ---</option>
    </select>
    <p className="text-xs text-muted-foreground">
      Paste section headings, numbered questions or full prompts. Review the list before generating.
      Wrapped guidance stays with its question. Use --- on its own line to set an exact boundary.
      Long lists are generated two questions at a time, up to 80 in one run.
    </p>
    <Label htmlFor="questionAssistantText">Grant form questions</Label>
    <Textarea id="questionAssistantText" rows={7} disabled={disabled} value={text}
      placeholder={"Project summary\n1. Team and resources\n2. Risks\n3. Costs and value for money"}
      onChange={(event) => onTextChange(event.target.value)} className="max-h-72 min-w-0 overflow-y-auto bg-white text-sm" />
    {questions.length > 0 && <div className="space-y-2 rounded-lg border bg-white p-3">
      <p role="status" className="text-sm font-semibold text-blue-900">
        {questions.length} questions or sections detected
      </p>
      <p className="text-xs text-muted-foreground">
        Each item below gets its own labelled answer. Headings work too; adding the full funder prompt gives more precise answers.
        Edit, merge or split any item if detection needs correcting.
      </p>
      <ol className="max-h-96 space-y-2 overflow-y-auto pr-1" aria-label="Questions to answer">
        {questions.map((question, index) => <li key={index} className="min-w-0 rounded-md border p-2">
          <details>
            <summary className="cursor-pointer break-words text-sm font-medium">
              {index + 1}. {question.split("\n")[0]}
            </summary>
            <div className="mt-2 space-y-2">
              <Label htmlFor={`review-question-${index}`}>Question {index + 1} and its guidance</Label>
              <Textarea id={`review-question-${index}`} disabled={disabled} rows={4} key={question} defaultValue={question}
                onBlur={(event) => { if (event.target.value !== question) replace(questions.map((item, i) => i === index ? event.target.value : item)); }} />
              <div className="flex flex-wrap gap-2">
                {index > 0 && <Button type="button" size="xs" variant="outline" disabled={disabled}
                  onClick={() => replace(questions.flatMap((item, i) => i === index ? [] : i === index - 1 ? [`${item}\n${question}`] : [item]))}>
                  Merge with previous
                </Button>}
                <Button type="button" size="xs" variant="outline" disabled={disabled || !question.includes("\n")}
                  onClick={() => replace(questions.flatMap((item, i) => i === index ? parseQuestionBlocks(item, "lines") : [item]))}>
                  Split into lines
                </Button>
                <Button type="button" size="xs" variant="outline" disabled={disabled}
                  onClick={() => replace(questions.filter((_, i) => i !== index))}>Remove</Button>
              </div>
            </div>
          </details>
        </li>)}
      </ol>
    </div>}
  </div>;
}
