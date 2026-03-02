/**
 * Urgency from grant deadline: days remaining → HIGH / MEDIUM / LOW.
 * Used in grants UI and reminder logic.
 */
export type UrgencyLevel = "HIGH" | "MEDIUM" | "LOW" | "NONE";

export interface UrgencyResult {
  level: UrgencyLevel;
  daysRemaining: number | null;
  label: string;
}

const HIGH_DAYS = 7;
const MEDIUM_DAYS = 14;

export function computeUrgency(deadline: Date | string | null | undefined): UrgencyResult {
  if (deadline == null) {
    return { level: "NONE", daysRemaining: null, label: "No deadline" };
  }
  const d = typeof deadline === "string" ? new Date(deadline) : deadline;
  if (Number.isNaN(d.getTime())) {
    return { level: "NONE", daysRemaining: null, label: "No deadline" };
  }
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  const daysRemaining = Math.ceil((end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

  if (daysRemaining < 0) {
    return { level: "NONE", daysRemaining, label: "Past deadline" };
  }
  if (daysRemaining <= HIGH_DAYS) {
    return { level: "HIGH", daysRemaining, label: `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left` };
  }
  if (daysRemaining <= MEDIUM_DAYS) {
    return { level: "MEDIUM", daysRemaining, label: `${daysRemaining} days left` };
  }
  return { level: "LOW", daysRemaining, label: `${daysRemaining} days left` };
}
