import { getSupabaseAdmin } from "./supabase";

const DEFAULT_TASKS: { name: string; slug: string; priority: "high" | "medium" | "low"; daysOffset?: number }[] = [
  { name: "Review eligibility", slug: "review_eligibility", priority: "high", daysOffset: 2 },
  { name: "Prepare documents", slug: "prepare_documents", priority: "medium", daysOffset: 5 },
  { name: "Submit application", slug: "submit_application", priority: "high" },
];

function addDays(date: Date, days: number): Date {
  const out = new Date(date);
  out.setDate(out.getDate() + days);
  return out;
}

/**
 * Create default tasks when an application is created.
 * Due dates: "Submit" = grant deadline if set; others = now + daysOffset or deadline - buffer.
 */
export async function createDefaultTasksForApplication(params: {
  applicationId: string;
  organisationId: string;
  grantId: string;
  grantDeadline?: string | Date | null;
}): Promise<void> {
  const { applicationId, organisationId, grantId, grantDeadline } = params;
  const supabase = getSupabaseAdmin();
  const now = new Date();
  const deadline = grantDeadline ? (typeof grantDeadline === "string" ? new Date(grantDeadline) : grantDeadline) : null;

  const dueDateForSubmit = deadline && deadline.getTime() > now.getTime() ? deadline : addDays(now, 14);
  const dueDateForTask = (task: (typeof DEFAULT_TASKS)[number]): string | null => {
    if (task.slug === "submit_application") return dueDateForSubmit.toISOString();
    if (task.daysOffset != null) return addDays(now, task.daysOffset).toISOString();
    if (deadline) return addDays(deadline, -3).toISOString();
    return addDays(now, 7).toISOString();
  };

  const rows = DEFAULT_TASKS.map((task) => ({
    applicationId,
    organisationId,
    grantId,
    name: task.name,
    slug: task.slug,
    status: "todo",
    priority: task.priority,
    dueDate: dueDateForTask(task),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }));

  await supabase.from("ApplicationTask").insert(rows);
}
