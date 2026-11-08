import { z } from "zod";
import { criterionSchema, factFields, type CriteriaDocument, type Criterion } from "@/lib/criteria";
const workloadSchema = z.object({ label: z.string().min(1), kind: z.enum(["question", "document", "budget"]), excerpt: z.string().min(1), wordLimit: z.number().int().positive().max(10000).optional() });
const termSchema = z.object({ label: z.string().min(1), value: z.string(), excerpt: z.string().min(1) });
export type ExtractedCriteriaPart = { criteria: Criterion[]; workload: CriteriaDocument["workload"]; objectives: string[]; terms: CriteriaDocument["terms"]; warnings: string[]; complete: boolean };
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
export function parseCriteriaPart(raw: string, source: string): ExtractedCriteriaPart {
  const part: ExtractedCriteriaPart = { criteria: [], workload: [], objectives: [], terms: [], warnings: [], complete: false };
  let data: Record<string, unknown> | null;
  try { data = record(JSON.parse(raw.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, ""))); }
  catch { part.warnings.push("One section could not be organised automatically. Its published text remains available below."); return part; }
  if (!data) { part.warnings.push("The automated response was incomplete. Review the published text below."); return part; }
  const normalized = source.replace(/\s+/g, " ");
  const quote = (value: unknown) => typeof value === "string" && value.trim() && normalized.includes(value.replace(/\s+/g, " ").trim());
  const rows = (key: string, max: number) => {
    if (!Array.isArray(data![key])) { part.warnings.push("An expected extraction list was missing; some guidance needs manual review."); return []; }
    const values = data![key] as unknown[];
    if (values.length > max) part.warnings.push("Some extracted entries exceeded the review limit. Consult the full published text.");
    return values.slice(0, max);
  };
  for (const item of rows("criteria", 100)) {
    const row = record(item);
    if (!row || !quote(row.excerpt)) { part.warnings.push("An extracted requirement had no verifiable quote and was excluded from automated checks."); continue; }
    const field = typeof row.field === "string" && factFields.some(field => field === row.field) ? row.field : null;
    const candidate = { ...row, id: "", field, operator: field ? row.operator : "confirm", expected: field ? row.expected : null, alternativeGroup: row.alternativeGroup ?? null };
    let parsed = criterionSchema.safeParse(candidate);
    if (!parsed.success) {
      // Keep verified evidence as an explicit manual check, never as an assumed pass.
      parsed = criterionSchema.safeParse({ id: "", label: typeof row.label === "string" && row.label.trim() ? row.label.slice(0,1000) : "Published requirement — confirm evidence", category: "other", mandatory: typeof row.mandatory === "boolean" ? row.mandatory : true, alternativeGroup: typeof row.alternativeGroup === "string" ? row.alternativeGroup : null, field: null, operator: "confirm", expected: null, excerpt: row.excerpt, question: typeof row.question === "string" && row.question.trim() ? row.question.slice(0,1000) : "What evidence confirms that this published requirement is met?" });
      part.warnings.push("Some requirements could not be mapped reliably and are retained as manual evidence checks.");
    }
    if (parsed.success) part.criteria.push(parsed.data);
    else part.warnings.push("A requirement could not be structured safely. Review its wording in the published text.");
  }
  for (const item of rows("workload", 100)) {
    const row = record(item); const parsed = workloadSchema.safeParse(row ? { ...row, wordLimit: row.wordLimit == null ? undefined : row.wordLimit } : item);
    if (parsed.success && quote(parsed.data.excerpt)) part.workload.push({ ...parsed.data, id: "" });
    else part.warnings.push("An application prompt could not be verified or structured. Review How to apply in the published text.");
  }
  for (const item of rows("terms", 30)) {
    const row = record(item); const parsed = termSchema.safeParse(row ? { ...row, value: typeof row.value === "number" ? String(row.value) : row.value } : item);
    if (parsed.success && quote(parsed.data.excerpt)) part.terms.push(parsed.data);
    else part.warnings.push("A funding term needs manual review against the published text.");
  }
  for (const item of rows("objectives", 30)) {
    if (typeof item === "string" && quote(item)) part.objectives.push(item);
    else part.warnings.push("An objective lacked a verifiable quote and was excluded.");
  }
  part.warnings = [...new Set(part.warnings)];
  part.complete = data.coverage === "complete" && !part.warnings.length;
  return part;
}
export function splitCriteriaText(text: string, maximum = 12000): string[] {
  const chunks: string[] = []; let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maximum, text.length);
    if (end < text.length) { const space = text.lastIndexOf(" ", end); if (space > start + maximum / 2) end = space; }
    chunks.push(text.slice(start, end)); start = end;
  }
  return chunks;
}
