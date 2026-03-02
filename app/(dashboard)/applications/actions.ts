"use server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveOrg } from "@/lib/auth";

const VALID_STATUSES = ["todo", "in_progress", "done", "cancelled"] as const;

export async function updateApplicationTaskStatus(
  taskId: string,
  status: (typeof VALID_STATUSES)[number]
): Promise<{ error?: string }> {
  if (!VALID_STATUSES.includes(status)) return { error: "Invalid status" };
  const { orgId } = await getActiveOrg();
  const supabase = getSupabaseAdmin();
  const { data: task } = await supabase
    .from("ApplicationTask")
    .select("id, organisationId")
    .eq("id", taskId)
    .single();
  if (!task || (task as { organisationId?: string }).organisationId !== orgId) {
    return { error: "Task not found" };
  }
  const { error } = await supabase
    .from("ApplicationTask")
    .update({ status, updatedAt: new Date().toISOString() })
    .eq("id", taskId);
  if (error) return { error: error.message };
  return {};
}
