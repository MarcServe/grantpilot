export type GrantEffortBand = "Quick win" | "Standard" | "Heavy";
export type GrantRoatLabel = "Excellent" | "Good" | "Medium" | "Low";
export type GrantPriorityLabel = "Apply today" | "Review this week" | "Lower priority";

export interface GrantEffortInput {
  amount?: number | null;
  deadline?: string | null;
  applicationUrlQuality?: string | null;
  applicationUrlKind?: string | null;
  eligibility?: string | null;
  description?: string | null;
  objectives?: string | null;
  score?: number | null;
  scoringSource?: string | null;
  missingCriteria?: string[] | null;
  improvementPlan?: { gaps?: string[]; actions?: string[] } | null;
}

export interface GrantEffortSignal {
  amount: number | null;
  estimatedMinutes: number;
  estimatedTimeLabel: string;
  effortBand: GrantEffortBand;
  roatLabel: GrantRoatLabel;
  priorityLabel: GrantPriorityLabel;
  opportunityScore: number;
  effortReasons: string[];
}

const HOUR = 60;
const DAY_MS = 86_400_000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundToFive(value: number): number {
  return Math.round(value / 5) * 5;
}

function daysUntil(deadline?: string | null): number | null {
  if (!deadline) return null;
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - Date.now()) / DAY_MS);
}

function formatTime(minutes: number): string {
  if (minutes < HOUR) return `${minutes} min`;
  const hours = Math.floor(minutes / HOUR);
  const mins = minutes % HOUR;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function hasAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

export function estimateGrantEffort(input: GrantEffortInput): GrantEffortSignal {
  const amount = typeof input.amount === "number" && Number.isFinite(input.amount) ? input.amount : null;
  const score = typeof input.score === "number" && Number.isFinite(input.score) ? input.score : 0;
  const text = [
    input.eligibility,
    input.description,
    input.objectives,
    ...(input.missingCriteria ?? []),
    ...(input.improvementPlan?.gaps ?? []),
    ...(input.improvementPlan?.actions ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const reasons: string[] = [];
  let minutes = 45;
  const verifiedDirect =
    input.applicationUrlQuality === "verified_direct" ||
    input.applicationUrlQuality === "verified_portal" ||
    input.applicationUrlKind === "direct_form" ||
    input.applicationUrlKind === "portal";

  if (verifiedDirect) {
    minutes -= 15;
    reasons.push("Verified application route");
  } else {
    minutes += 30;
    reasons.push("Grant page route needs manual review");
  }

  if (hasAny(text, ["research and development", "r&d", "feasibility", "prototype", "technical work package"])) {
    minutes += 35;
    reasons.push("Technical project evidence likely required");
  }
  if (hasAny(text, ["collaboration", "consortium", "partner", "academic", "university", "letter of support"])) {
    minutes += 35;
    reasons.push("Partnership evidence may be needed");
  }
  if (hasAny(text, ["match funding", "co-funding", "budget", "cash flow", "financial statements", "accounts"])) {
    minutes += 25;
    reasons.push("Budget or finance evidence likely required");
  }
  if (hasAny(text, ["impact", "beneficiaries", "outcomes", "monitoring", "evaluation", "kpi"])) {
    minutes += 15;
    reasons.push("Impact case needs clear proof");
  }
  if (amount != null && amount >= 250_000) {
    minutes += 25;
    reasons.push("Higher-value opportunity likely needs fuller evidence");
  } else if (amount != null && amount <= 25_000) {
    minutes -= 5;
    reasons.push("Smaller funding amount usually means lighter application effort");
  }

  const missingCount =
    (input.missingCriteria?.length ?? 0) +
    (input.improvementPlan?.gaps?.length ?? 0) +
    (input.improvementPlan?.actions?.length ?? 0);
  if (missingCount > 0) {
    minutes += Math.min(35, missingCount * 8);
    reasons.push("Business DNA evidence gaps need filling");
  }

  const deadlineDays = daysUntil(input.deadline);
  if (deadlineDays != null && deadlineDays >= 0 && deadlineDays <= 7) {
    reasons.push("Deadline is urgent");
  }

  minutes = clamp(roundToFive(minutes), 15, 360);
  const effortBand: GrantEffortBand =
    minutes <= 35 ? "Quick win" : minutes <= 105 ? "Standard" : "Heavy";

  const valuePerHour = amount != null ? amount / Math.max(minutes / HOUR, 0.25) : null;
  const roatLabel: GrantRoatLabel =
    valuePerHour != null
      ? valuePerHour >= 5000
        ? "Excellent"
        : valuePerHour >= 1500
          ? "Good"
          : valuePerHour >= 500
            ? "Medium"
            : "Low"
      : score >= 85 && minutes <= 90
        ? "Good"
        : score >= 50 && minutes <= 120
          ? "Medium"
          : "Low";

  const urgencyBoost =
    deadlineDays != null && deadlineDays >= 0
      ? deadlineDays <= 7
        ? 14
        : deadlineDays <= 21
          ? 8
          : 0
      : 0;
  const linkBoost = verifiedDirect ? 8 : 0;
  const roatBoost = roatLabel === "Excellent" ? 14 : roatLabel === "Good" ? 9 : roatLabel === "Medium" ? 4 : 0;
  const effortPenalty = effortBand === "Heavy" ? 10 : effortBand === "Standard" ? 4 : 0;
  const opportunityScore = clamp(Math.round(score * 0.65 + roatBoost + urgencyBoost + linkBoost - effortPenalty), 1, 100);

  const priorityLabel: GrantPriorityLabel =
    score >= 85 && (deadlineDays == null || deadlineDays <= 21 || roatLabel === "Excellent")
      ? "Apply today"
      : score >= 50 && (deadlineDays == null || deadlineDays <= 45 || roatLabel !== "Low")
        ? "Review this week"
        : "Lower priority";

  return {
    amount,
    estimatedMinutes: minutes,
    estimatedTimeLabel: formatTime(minutes),
    effortBand,
    roatLabel,
    priorityLabel,
    opportunityScore,
    effortReasons: reasons.slice(0, 4),
  };
}
