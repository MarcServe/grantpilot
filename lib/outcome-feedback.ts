import { getSupabaseAdmin } from "./supabase";

/** Applications that have been sent / approved for filing — awaiting funder decision in product terms */
export const OUTCOME_FEEDBACK_APPLICATION_STATUSES = ["SUBMITTED", "APPROVED"] as const;

/** Recorded outcomes that satisfy the reminder (stop nagging) */
export const OUTCOME_TERMINAL_VALUES = new Set(["shortlisted", "awarded", "rejected", "withdrawn"]);

export type ApplicationNeedingOutcome = {
  applicationId: string;
  grantId: string;
  grantName: string;
  status: string;
  submittedAt: string | null;
  outcomeRecorded: string | null;
};

export type RecordedOutcomeInsight = {
  applicationId: string;
  grantId: string;
  grantName: string;
  funder: string;
  outcome: string;
  reportedAt: string | null;
  funderFeedback: string | null;
  responseText: string | null;
  userNotes: string | null;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  nextActions: string[];
  scoringAdjustment: number | null;
};

/** True when we still want the user to record or refine an outcome for fundraising intelligence */
export function applicationNeedsOutcomeReminder(recordedOutcome: string | null | undefined): boolean {
  const v = recordedOutcome ?? null;
  return v == null || !OUTCOME_TERMINAL_VALUES.has(v);
}

function grantNameFromRow(app: Record<string, unknown>): string {
  const g = app.Grant ?? app.grant;
  if (!g || typeof g !== "object") return "Grant";
  const row = g as Record<string, unknown>;
  return String(row.name ?? row.title ?? "Grant");
}

function grantFromOutcomeRow(row: Record<string, unknown>): { name: string; funder: string } {
  const grant = Array.isArray(row.Grant) ? row.Grant[0] : row.Grant;
  if (!grant || typeof grant !== "object") return { name: "Grant", funder: "Funder" };
  const g = grant as Record<string, unknown>;
  return {
    name: String(g.name ?? "Grant"),
    funder: String(g.funder ?? "Funder"),
  };
}

function parseLearningNotes(value: unknown): {
  userNotes: string | null;
  insight?: {
    summary?: unknown;
    strengths?: unknown;
    weaknesses?: unknown;
    nextActions?: unknown;
    scoringAdjustment?: unknown;
  };
} {
  if (typeof value !== "string" || !value.trim()) return { userNotes: null };
  try {
    const parsed = JSON.parse(value) as {
      userNotes?: string | null;
      insight?: {
        summary?: unknown;
        strengths?: unknown;
        weaknesses?: unknown;
        nextActions?: unknown;
        scoringAdjustment?: unknown;
      };
    };
    return {
      userNotes: parsed.userNotes ?? null,
      insight: parsed.insight,
    };
  } catch {
    return { userNotes: value };
  }
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

async function fetchSubmittedApplicationsForOrg(orgId: string): Promise<Record<string, unknown>[]> {
  const supabase = getSupabaseAdmin();

  const primary = await supabase
    .from("Application")
    .select("id, status, submittedAt, grantId, Grant(id, name)")
    .eq("organisationId", orgId)
    .in("status", [...OUTCOME_FEEDBACK_APPLICATION_STATUSES])
    .order("updatedAt", { ascending: false })
    .limit(100);

  if (!primary.error && primary.data?.length) {
    return primary.data as Record<string, unknown>[];
  }

  const alt = await supabase
    .from("Application")
    .select("id, status, submitted_at, grant_id, Grant(id, name)")
    .eq("organisation_id", orgId)
    .in("status", [...OUTCOME_FEEDBACK_APPLICATION_STATUSES])
    .order("updated_at", { ascending: false })
    .limit(100);

  if (!alt.error && alt.data?.length) {
    return alt.data as Record<string, unknown>[];
  }

  return [];
}

/**
 * Submitted or approved applications where outcome feedback is missing or still non-terminal
 * (applied / unknown until upgraded to shortlisted, awarded, rejected, or withdrawn).
 */
export async function fetchApplicationsNeedingOutcome(orgId: string): Promise<ApplicationNeedingOutcome[]> {
  const list = await fetchSubmittedApplicationsForOrg(orgId);
  if (list.length === 0) return [];

  const appIds = list.map((a) => String(a.id));
  const supabase = getSupabaseAdmin();

  const { data: outcomeRows } = await supabase
    .from("ApplicationOutcome")
    .select("applicationId, outcome")
    .in("applicationId", appIds);

  const outcomeByApp = new Map<string, string>();
  for (const row of outcomeRows ?? []) {
    const r = row as { applicationId?: string; outcome?: string };
    if (r.applicationId && r.outcome) outcomeByApp.set(r.applicationId, r.outcome);
  }

  const result: ApplicationNeedingOutcome[] = [];
  for (const app of list) {
    const id = String(app.id);
    const recorded = outcomeByApp.get(id) ?? null;
    if (!applicationNeedsOutcomeReminder(recorded)) continue;

    const grantId = String(app.grantId ?? app.grant_id ?? "");
    const submittedAt = (app.submittedAt ?? app.submitted_at ?? null) as string | null;

    result.push({
      applicationId: id,
      grantId,
      grantName: grantNameFromRow(app),
      status: String(app.status),
      submittedAt,
      outcomeRecorded: recorded,
    });
  }

  return result;
}

export async function fetchRecordedOutcomeInsights(orgId: string): Promise<RecordedOutcomeInsight[]> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("ApplicationOutcome")
    .select("applicationId, grantId, outcome, funderFeedback, responseText, learningNotes, reportedAt, updatedAt, Grant(name, funder)")
    .eq("organisationId", orgId)
    .order("updatedAt", { ascending: false })
    .limit(25);

  return (data ?? []).map((row) => {
    const item = row as Record<string, unknown>;
    const grant = grantFromOutcomeRow(item);
    const notes = parseLearningNotes(item.learningNotes);
    const insight = notes.insight;
    const fallbackSummary =
      typeof item.funderFeedback === "string" && item.funderFeedback.trim()
        ? item.funderFeedback.trim()
        : "Outcome recorded. Future grant checks can show this result as advisory context.";
    const scoringAdjustment = Number(insight?.scoringAdjustment);

    return {
      applicationId: String(item.applicationId ?? ""),
      grantId: String(item.grantId ?? ""),
      grantName: grant.name,
      funder: grant.funder,
      outcome: String(item.outcome ?? "unknown"),
      reportedAt: (item.reportedAt ?? item.updatedAt ?? null) as string | null,
      funderFeedback: typeof item.funderFeedback === "string" ? item.funderFeedback : null,
      responseText: typeof item.responseText === "string" ? item.responseText : null,
      userNotes: notes.userNotes,
      summary: typeof insight?.summary === "string" && insight.summary.trim() ? insight.summary : fallbackSummary,
      strengths: toStringArray(insight?.strengths),
      weaknesses: toStringArray(insight?.weaknesses),
      nextActions: toStringArray(insight?.nextActions),
      scoringAdjustment: Number.isFinite(scoringAdjustment) ? scoringAdjustment : null,
    };
  });
}
