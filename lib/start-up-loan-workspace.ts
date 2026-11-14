import { z } from "zod";
export const LOAN_TASKS = [
  { id: "business_plan", title: "Business plan", owner: "Applicant and business adviser", next: "Complete discovery inputs, then prepare an editable business plan.", field: "products" },
  { id: "cash_flow", title: "12-month cash-flow forecast", owner: "Applicant and financial adviser", next: "Gather monthly sales, costs, drawings and repayment assumptions. Review the official workbook.", field: "pricing" },
  { id: "personal_budget", title: "Personal survival budget", owner: "Applicant", next: "Confirm real personal income, living costs and existing debt payments.", field: "monthlyPersonalIncome" },
  { id: "identity", title: "Identity and business details", owner: "Applicant", next: "Gather genuine identity, address and right-to-work evidence for the lender.", field: "applicantName" },
  { id: "statements", title: "Bank statements and credit readiness", owner: "Applicant", next: "Gather three consecutive months of personal statements and check Experian CreditLock.", field: "experianLock" },
  { id: "request", title: "Loan request and declarations", owner: "Applicant", next: "Itemise use of funds and confirm declarations in the official application.", field: "useOfFunds" },
] as const;
export const TASK_STATUS = { not_started: "Not started", inputs_needed: "Inputs needed", draft: "Draft", adviser_review: "Adviser review requested", changes_requested: "Changes requested", applicant_approved: "Applicant approved for preparation" } as const;
export const taskIdSchema = z.enum(["business_plan", "cash_flow", "personal_budget", "identity", "statements", "request"]);
export const taskSchema = z.object({ status: z.enum(["not_started", "inputs_needed", "draft", "adviser_review", "changes_requested", "applicant_approved"]).default("not_started"), assignee: z.string().trim().max(160).default(""), dueDate: z.string().max(10).refine(v => v === "" || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v), "Enter a valid date").default(""), note: z.string().trim().max(2000).default(""), updatedBy: z.enum(["applicant", "admin"]).optional(), updatedAt: z.string().optional() });
export const workspaceSchema = z.record(taskIdSchema, taskSchema).default({});
export type LoanWorkspace = z.infer<typeof workspaceSchema>;
export const taskPatchSchema = z.object({ taskId: taskIdSchema, expectedUpdatedAt: z.string().datetime({offset:true}), task: taskSchema.omit({ updatedBy: true, updatedAt: true }), intakeId: z.string().min(1).optional() });
export function updateLoanTask(current: LoanWorkspace, patch: z.infer<typeof taskPatchSchema>, admin: boolean, now: string): LoanWorkspace {
  const previous = current[patch.taskId] ?? taskSchema.parse({});
  if (!admin && (patch.task.assignee !== previous.assignee || patch.task.dueDate !== previous.dueDate)) throw new Error("Only administrators can assign advisers or due dates.");
  if (admin && patch.task.status === "applicant_approved" && previous.status !== "applicant_approved") throw new Error("Only the applicant can approve their preparation task.");
  return { ...current, [patch.taskId]: { ...patch.task, updatedBy: admin ? "admin" : "applicant", updatedAt: now } };
}
